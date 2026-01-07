import os
import json
import time
import threading
from datetime import datetime
from pynput import keyboard, mouse
import ctypes
from ctypes import Structure, windll, c_uint, sizeof, byref

# -------------------------------------------------------------------------
# Windows API for Idle Time
# -------------------------------------------------------------------------
import sys
import re
import urllib.request
import ssl
import random

# CONSTANTS
GITHUB_USERNAME = "Addressmehari"
GIT_POST_THRESHOLD = 10

# Allow importing from visualizer folder
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'visualizer'))

try:
    # Attempt to import generation logic
    # We need to suppress print output from the import if possible or just accept it
    from fetch_stargazers import generate_city_slots, string_to_pseudo_random, string_to_color
except ImportError:
    print("Could not import visualizer logic. Make sure fetch_stargazers.py is in visualizer/")
    generate_city_slots = None

class LASTINPUTINFO(Structure):
    _fields_ = [
        ('cbSize', c_uint),
        ('dwTime', c_uint),
    ]

def get_idle_duration():
    lastInputInfo = LASTINPUTINFO()
    lastInputInfo.cbSize = sizeof(lastInputInfo)
    if windll.user32.GetLastInputInfo(byref(lastInputInfo)):
        millis = windll.kernel32.GetTickCount() - lastInputInfo.dwTime
        return millis / 1000.0
    return 0.0

def get_github_contributions(username):
    """Scrapes the total contributions from the Github profile page."""
    # Use the partial view which is more reliable and lighter
    url = f"https://github.com/users/{username}/contributions"
    try:
        # Create a context that doesn't verify SSL certificates
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        )
        
        with urllib.request.urlopen(req, context=ctx, timeout=10) as response:
            html = response.read().decode('utf-8')
            
            patterns = [
                r'([\d,]+)\s+contributions\s+in\s+the\s+last\s+year',
                r'([\d,]+)\s+contributions\s+in\s+\d{4}'
            ]
            
            for p in patterns:
                match = re.search(p, html)
                if match:
                    count_str = match.group(1).replace(',', '')
                    return int(count_str)
                    
            print("Could not find contribution count in profile HTML.")
            return None
            
    except Exception as e:
        print(f"Error fetching Github stats: {e}")
        return None

# -------------------------------------------------------------------------
# Data Collector Class
# -------------------------------------------------------------------------
class DataCollector:
    def __init__(self, filename="datas/activity_log.json", on_reward=None):
        self.filename = filename
        self.on_reward = on_reward
        
        # In-memory metrics
        self.key_presses = 0
        self.mouse_clicks = 0
        self.active_seconds = 0 
        self.idle_seconds = 0
        
        self.save_interval_sec = 60
        self.idle_threshold_sec = 2.0 
        self.running = True

        # Progress Counters (Temporary, reset after reward)
        self.progress_active_sec = 0
        self.progress_idle_sec = 0
        self.progress_keys = 0
        self.progress_commits = 0
        
        # Last known total to calculate diffs
        self.last_total_commits = 0
        self.upgrade_target_user = None
        
        # Thresholds (Reduced for Testing)
        
        # Thresholds (Reduced for Testing)
        self.THRESHOLD_HOUSE = 300      # 300 active seconds -> 1 House (Normal)
        self.THRESHOLD_TREE = 300       # 300 idle seconds -> 1 Tree (Normal)
        self.THRESHOLD_UPGRADE = 1000   # 1000 keys -> 1 Upgrade


        # Start listeners
        self.keyboard_listener = keyboard.Listener(on_release=self.on_key)
        self.mouse_listener = mouse.Listener(on_click=self.on_click)
        
        self.keyboard_listener.start()
        self.mouse_listener.start()
        
        # Start background threads
        self.saver_thread = threading.Thread(target=self.save_loop, daemon=True)
        self.monitor_thread = threading.Thread(target=self.monitor_loop, daemon=True)
        self.github_thread = threading.Thread(target=self.github_loop, daemon=True)
        
        self.saver_thread.start()
        self.monitor_thread.start()
        self.github_thread.start()

        # Cache for house count to avoid reading file every second
        self.cached_house_count = 0
        self.update_house_count()
        
        print(f"Collector started. saving to {self.filename} every minute.")
        self.ensure_next_upgrade_target()

    def on_key(self, key):
        self.key_presses += 1

    def on_click(self, x, y, button, pressed):
        if pressed:
            self.mouse_clicks += 1

    def save_data(self):
        # 1. Read existing totals
        if os.path.exists(self.filename):
            try:
                with open(self.filename, 'r') as f:
                    data = json.load(f)
                    # Handle both list (old format) and dict (new format)
                    if isinstance(data, list) and len(data) > 0:
                        # If list, take the last one or sum them up? let's reset to one record
                        # Or better, just treat as new structure.
                        # Ideally, users want one object: {"total_keys": 100, ...}
                        # Let's check if it's our new format
                        pass
                    if not isinstance(data, dict):
                        data = {
                            "total_keys": 0,
                            "total_clicks": 0,
                            "total_active_seconds": 0,
                            "total_idle_seconds": 0,
                            "last_updated": ""
                        }
            except Exception:
                data = {
                    "total_keys": 0,
                    "total_clicks": 0,
                    "total_active_seconds": 0,
                    "total_idle_seconds": 0,
                    "total_commits": 0,
                    "progress_commits": 0,
                    "last_updated": ""
                }
        else:
             data = {
                "total_keys": 0,
                "total_clicks": 0,
                "total_active_seconds": 0,
                "total_idle_seconds": 0,
                "total_commits": 0,
                "progress_commits": 0,
                "last_updated": ""
            }

        # 2. Update totals
        data["total_keys"] = data.get("total_keys", 0) + self.key_presses
        data["total_clicks"] = data.get("total_clicks", 0) + self.mouse_clicks
        data["total_active_seconds"] = data.get("total_active_seconds", 0) + self.active_seconds
        data["total_idle_seconds"] = data.get("total_idle_seconds", 0) + self.idle_seconds
        data["last_updated"] = datetime.now().isoformat()
        
        # 3. Update Progress Counters (Temporary)
        self.progress_active_sec += self.active_seconds
        self.progress_idle_sec += self.idle_seconds
        self.progress_keys += self.key_presses
        
        # Persist the commit counters (they are updated in github_loop, but save them here)
        data["total_commits"] = self.last_total_commits
        data["progress_commits"] = self.progress_commits

        # 4. Check & Trigger Rewards
        self.check_rewards()

        # 5. Reset internal counters (The per-minute buffers)
        self.key_presses = 0
        self.mouse_clicks = 0
        self.active_seconds = 0
        self.idle_seconds = 0
        
        # 6. Save overwrite
        try:
            # Ensure datas dir exists
            os.makedirs(os.path.dirname(self.filename), exist_ok=True)
            
            with open(self.filename, 'w') as f:
                json.dump(data, f, indent=4)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Stats saved. Progress - Active: {self.progress_active_sec}/{self.THRESHOLD_HOUSE}, Idle: {self.progress_idle_sec}/{self.THRESHOLD_TREE}")
        except Exception as e:
            print(f"Error saving: {e}")

    def get_random_house_name(self):
        prefixes = ["Pixel", "Syntax", "Logic", "Binary", "Coder's", "Data", "Algorithm", "Memory", "Git", "Python", "Terminal", "Debug", "Loop", "Function", "Variable", "Cloud", "Server", "Script", "Byte", "Stack"]
        suffixes = ["Cottage", "Station", "Loft", "Bungalow", "Cabin", "Den", "Abode", "Manor", "Garrison", "Palace", "Tower", "Dwelling", "Lodge", "Farm", "Villa", "Hut", "Keep", "Hub", "Base", "Outpost"]
        return f"{random.choice(prefixes)} {random.choice(suffixes)}"

    def check_rewards(self):
        """Checks if progress counters met thresholds"""
        rewards_triggered = False
        houses_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visualizer", "stargazers_houses.json")
        roads_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visualizer", "roads.json")
        
        if not os.path.exists(houses_path): return

        try:
            with open(houses_path, 'r') as f:
                houses = json.load(f)
        except:
            return

        # A. Houses (Active Time)
        while self.progress_active_sec >= self.THRESHOLD_HOUSE:
            self.progress_active_sec -= self.THRESHOLD_HOUSE
            print(">>> REWARD: New House Earned!")
            if self.on_reward: self.on_reward("New House Built! 🏠", "Your activity has constructed a new building in the city.")
            # Add House
            # count = len([h for h in houses if h.get('type') == 'activity_house'])
            houses.append({
                "type": "activity_house",
                "login": self.get_random_house_name(),
                # Placeholder, will be fixed by recalculate
                "x": 0, "y": 0 
            })
            rewards_triggered = True

        # B. Trees (Idle Time)
        while self.progress_idle_sec >= self.THRESHOLD_TREE:
            self.progress_idle_sec -= self.THRESHOLD_TREE
            print(">>> REWARD: New Tree Planted!")
            if self.on_reward: self.on_reward("Tree Planted! 🌳", "Your idle time has grown a new tree.")
            houses.append({
                "type": "tree",
                "x": 0, "y": 0,
                "obstacle": "tree"
            })
            rewards_triggered = True

        # C. Upgrades (Keys)
        while self.progress_keys >= self.THRESHOLD_UPGRADE:
            self.progress_keys -= self.THRESHOLD_UPGRADE
            print(">>> REWARD: House Upgrade Unlocked!")
            if self.on_reward: self.on_reward("Upgrade Unlocked! ✨", "Your typing frenzy added a terrace to a house!")
            
            # 1. Find the designated target from 'houses' list
            target = next((h for h in houses if h.get('is_upgrade_target')), None)
            
            # Fallback if no target marked
            if not target:
                candidates = [h for h in houses if h.get('obstacle') != 'tree' and not h.get('has_terrace')]
                if candidates:
                    target = random.choice(candidates)

            if target:
                target['has_terrace'] = True
                # Clean up flag
                if 'is_upgrade_target' in target:
                    del target['is_upgrade_target']
                
                rewards_triggered = True

                # 2. Pick NEXT target immediately to show in UI
                candidates = [h for h in houses if h.get('obstacle') != 'tree' and h.get('type') != 'git_post' and not h.get('has_terrace') and not h.get('is_upgrade_target')]
                if candidates:
                    next_target = random.choice(candidates)
                    next_target['is_upgrade_target'] = True
                    self.upgrade_target_user = next_target.get('username')

        # D. Github Posts (Commits)
        while self.progress_commits >= GIT_POST_THRESHOLD:
            self.progress_commits -= GIT_POST_THRESHOLD
            print(">>> REWARD: New Git Post Created!")
            if self.on_reward: self.on_reward("Git Post! 🐙", "5 Commits pushed! A new Git House appears.")
            
            # Find a location? (Recalculate handles it)
            # Create Git Post House
            houses.append({
                "type": "git_post",
                "login": f"Commit Node {random.randint(100,999)}",
                "x": 0, "y": 0, # Placeholder
                "username": self.get_random_house_name(), # Use random name for variety
            })
            rewards_triggered = True

        if rewards_triggered and generate_city_slots:
            self.recalculate_and_save(houses, houses_path, roads_path)

    def recalculate_and_save(self, entities, h_path, r_path):
        """Recalculates positions and saves files"""
        # Separate Owner (First)
        if not entities: return
        
        owner = entities[0]
        others = entities[1:]
        
        # Shuffle others to mix new entities in
        # Note: If we shuffle every time, the whole city rearranges every minute.
        # This might be jarring. 
        # OPTION: Only append new ones to the end?
        # But generate_city_slots does a spiral. If we append, they go to the outside.
        # That is actually perfect. "Constructing" outwards.
        # So DO NOT SHUFFLE, just preserve order.
        
        # However, generate_city_slots logic in fetch_stargazers previously shuffled.
        # Let's trust the current order in JSON is chronological.
        
        # Recalculate Layout
        full_list = [owner] + others # Owner should be 0
        slots, facings, roads = generate_city_slots(len(full_list))
        
        processed = []
        
        for i, ent in enumerate(full_list):
            if i >= len(slots): break
            
            s_x, s_y = slots[i]
            
            # Update Position
            ent['x'] = s_x
            ent['y'] = s_y
            
            # If it's a house, ensure attributes exist (if newly created raw)
            if ent.get('obstacle') != 'tree':
                if 'color' not in ent:
                    # It's a raw new house entry
                    name = ent.get('login', 'Unknown')
                    ent['username'] = name
                    ent['color'] = string_to_color(name)
                    attrs = string_to_pseudo_random(name)
                    ent['roofStyle'] = attrs[0]
                    ent['doorStyle'] = attrs[1]
                    ent['windowStyle'] = attrs[2]
                    ent['chimneyStyle'] = attrs[3]
                    ent['wallStyle'] = attrs[4]
                    ent['wallStyle'] = attrs[4]
                    if 'has_terrace' not in ent: ent['has_terrace'] = False
            
            # Determine color/style for git_post
            if ent.get('type') == 'git_post':
                 # Force Orange for Git Posts
                 ent['color'] = "#f05032" # Git Orange
                 ent['roofStyle'] = 1
                 ent['doorStyle'] = 3
                 ent['wallStyle'] = 0
                 ent['username'] = ent.get('login', 'Git Post')
                 ent['has_terrace'] = True # Always fancy

            # Update Facing
            if i < len(facings):
                ent['facing'] = facings[i]
            else:
                ent['facing'] = 'down'
                
            processed.append(ent)
            
        # Save
        with open(h_path, 'w') as f:
            json.dump(processed, f, indent=4)
            
        road_data = [{"x": int(r[0]), "y": int(r[1])} for r in roads]
        with open(r_path, 'w') as f:
            json.dump(road_data, f, indent=4)
            
        print(f"City Layout Updated: {len(processed)} entities.")
        self.cached_house_count = len(processed)

    def update_world_state(self):
        """Updates world.json with current time of day"""
        world_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visualizer", "world.json")
        try:
            now = datetime.now()
            hour = now.hour
            # Simple logic: Night from 6 PM (18) to 6 AM (6)
            is_night = hour < 6 or hour >= 18
            time_of_day = "night" if is_night else "day"
            
            current_state = {}
            if os.path.exists(world_path):
                with open(world_path, 'r') as f:
                    current_state = json.load(f)
            
            # Only save if changed to reduce IO
            if current_state.get("timeOfDay") != time_of_day:
                current_state["timeOfDay"] = time_of_day
                with open(world_path, 'w') as f:
                    json.dump(current_state, f, indent=4)
                print(f"World state updated: {time_of_day}")
        except Exception as e:
            print(f"Error updating world state: {e}")

    def update_house_count(self):
        """Updates the cached number of houses from file"""
        houses_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visualizer", "stargazers_houses.json")
        try:
            if os.path.exists(houses_path):
                with open(houses_path, 'r') as f:
                    data = json.load(f)
                    self.cached_house_count = len(data)
        except:
            pass

    def update_construction_state(self):
        """Updates the visualizer with the next potential building spot and progress"""
        if not generate_city_slots: return

        # 1. Calculate Next Slot
        # If we have N houses, the next one is at index N (0-indexed) -> limit=N+1
        next_count = self.cached_house_count + 1
        slots, _, _ = generate_city_slots(next_count)
        
        if not slots: return
        
        next_slot = slots[-1] # The last one is the new one
        
        # 2. Calculate Progress
        # We need "Existing Progress stored in file" + "Pending buffer in memory"
        # Since 'progress_active_sec' in self is accumulative until threshold?
        # Yes, check_rewards subtracts threshold.
        
        # Current 'Buffer' (self.active_seconds) is added to 'self.progress_active_sec' only on SAVE.
        # But we want REAL TIME.
        # So effective progress = self.progress_active_sec + self.active_seconds
        
        current_active = self.progress_active_sec + self.active_seconds
        current_idle = self.progress_idle_sec + self.idle_seconds
        current_keys = self.progress_keys + self.key_presses
        # Commits are instantly updated in github_loop, so just use progress_commits
        current_commits = self.progress_commits

        state = {
            "next_slot": {"x": next_slot[0], "y": next_slot[1]},
            "metrics": {
                "active": {
                    "current": int(current_active),
                    "max": self.THRESHOLD_HOUSE,
                    "label": "Construction"
                },
                "idle": {
                    "current": int(current_idle),
                    "max": self.THRESHOLD_TREE,
                    "label": "Overgrowth"
                },
                "git": {
                    "current": int(current_commits),
                    "max": GIT_POST_THRESHOLD,
                    "label": "Git Post"
                },
                "keys": {
                    "current": int(current_keys),
                    "max": self.THRESHOLD_UPGRADE,
                    "label": "Upgrade"
                }
            },
            "upgrade_target": self.upgrade_target_user
        }
        
        out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visualizer", "construction_state.json")
        try:
            with open(out_path, 'w') as f:
                json.dump(state, f)
        except Exception:
            pass

    def ensure_next_upgrade_target(self):
        """Ensures one house is targeted for the next upgrade"""
        houses_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visualizer", "stargazers_houses.json")
        if not os.path.exists(houses_path): return

        try:
            with open(houses_path, 'r') as f:
                houses = json.load(f)
            
            # Check if one is already targeted
            existing = next((h for h in houses if h.get('is_upgrade_target')), None)
            if existing:
                self.upgrade_target_user = existing.get('username')
                return

            # Pick new target (exclude trees, git posts, and already terraced houses)
            candidates = [h for h in houses if h.get('obstacle') != 'tree' and h.get('type') != 'git_post' and not h.get('has_terrace')]
            if candidates:
                target = random.choice(candidates)
                target['is_upgrade_target'] = True
                self.upgrade_target_user = target.get('username')
                
                # Save just the metadata update
                with open(houses_path, 'w') as f:
                    json.dump(houses, f, indent=4)
                print(f"Next Upgrade Target selected: {self.upgrade_target_user}")
                
        except Exception as e:
            print(f"Error ensuring upgrade target: {e}")

    def monitor_loop(self):
        """Checks idle status every second"""
        while self.running:
            idle = get_idle_duration()
            if idle < self.idle_threshold_sec:
                self.active_seconds += 1
            else:
                self.idle_seconds += 1
            
            # Update world state logic less frequently? 
            # Doing it every second is overkill but harmless for check.
            # Writing only happens on change.
            self.update_world_state()
            
            # Update Construction State (Next Plot)
            self.update_construction_state()
            
            time.sleep(1)

    def save_loop(self):
        while self.running:
            time.sleep(self.save_interval_sec)
            self.save_data()

    def github_loop(self):
        """Checks github stats every 5 minutes (300s)"""
        # Initial wait to let other things load? No, check immediately.
        # But we need to load 'last_total_commits' from file if possible first.
        # It's done in save_data... wait, __init__ triggers separate threads.
        # We need to load initial state.
        
        # Load initial
        if os.path.exists(self.filename):
            try:
                with open(self.filename, 'r') as f:
                    d = json.load(f)
                    self.last_total_commits = d.get('total_commits', 0)
                    self.progress_commits = d.get('progress_commits', 0)
            except: pass
            
        print(f"Github Monitor started. Target: {GITHUB_USERNAME}")
        
        # Initial Check: Create one if none exist
        houses_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visualizer", "stargazers_houses.json")
        try:
             with open(houses_path, 'r') as f:
                h_data = json.load(f)
                git_posts = [h for h in h_data if h.get('type') == 'git_post']
                if not git_posts:
                    print("No Git Posts found. Creating the First Foundation...")
                    h_data.append({
                        "type": "git_post",
                        "login": "Git Foundation",
                        "x": 0, "y": 0,
                        "username": "Git Foundation",
                        "color": "#f05032",
                        "has_terrace": True
                    })
                    # Save immediately to establish base
                    # But we also need to recalculate coords.
                    # Use self.recalculate_and_save
                    roads_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visualizer", "roads.json")
                    self.recalculate_and_save(h_data, houses_path, roads_path)
        except Exception as e:
            print(f"Error checking initial git posts: {e}")

        while self.running:
            current = get_github_contributions(GITHUB_USERNAME)
            if current is not None:
                print(f"[Github] Contributions: {current} (Last: {self.last_total_commits})")
                
                if current > self.last_total_commits:
                    diff = current - self.last_total_commits
                    # Sanity check: if diff is huge (e.g. first run of year), restrict?
                    # User said "count 5 commits". If we jump from 0 to 1000, we get 200 houses.
                    # That might be intended. But if self.last_total_commits was 0 (fresh install), 
                    # we shouldn't spam 200 houses unless the user wants it.
                    # However, typical usage logic implies capturing *new* activity.
                    # If this is the FIRST run ever, last_total_commits might be 0.
                    # If current is 500, diff is 500.
                    # We should probably initialize last_total_commits to current on FIRST run,
                    # UNLESS we want to backfill.
                    # "check the profile, after the last created house how many commited"
                    # If 0 houses, we created one.
                    # So we should probably start counting from NOW.
                    
                    if self.last_total_commits == 0 and diff > 100:
                        # First sync, likely. Set baseline.
                        self.last_total_commits = current
                        print("Initialized Github Baseline.")
                        diff = 0
                    
                    if diff > 0:
                        self.progress_commits += diff
                        self.last_total_commits = current
                        self.check_rewards() # Trigger generation
                        
            time.sleep(180) # Check every 3 minutes (180s)

    def stop(self):
        self.running = False
        self.keyboard_listener.stop()
        self.mouse_listener.stop()

if __name__ == "__main__":
    collector = DataCollector()
    try:
        # Keep main thread alive
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Stopping...")
        collector.save_data() 
        collector.stop()
