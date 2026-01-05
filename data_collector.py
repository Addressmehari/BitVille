import os
import json
import time
import threading
from datetime import datetime
import requests
from pynput import keyboard, mouse
import ctypes
from ctypes import Structure, windll, c_uint, sizeof, byref

# -------------------------------------------------------------------------
# Windows API for Idle Time
# -------------------------------------------------------------------------
import sys

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
        # Progress Counters (Temporary, reset after reward)
        self.progress_active_sec = 0
        self.progress_idle_sec = 0
        self.progress_keys = 0
        
        # GitHub Tracking
        self.github_username = "addressmehari"
        self.last_commit_id = None
        self.commit_credits = 0 # 10 commits -> 1 House
        self.total_commits_all_time = 0
        
        self.commit_credits = 0 # 1 commit -> 1 House
        self.total_commits_all_time = 0
        
        # Thresholds (Reduced for Testing)
        self.THRESHOLD_HOUSE = 10       # 10 active seconds -> 1 House
        self.THRESHOLD_TREE = 10        # 10 idle seconds -> 1 Tree
        self.THRESHOLD_UPGRADE = 50     # 50 keys -> 1 Upgrade
        self.THRESHOLD_GIT_HOUSE = 1    # 1 Commit -> 1 House (Debug)


        # Start listeners
        self.keyboard_listener = keyboard.Listener(on_release=self.on_key)
        self.mouse_listener = mouse.Listener(on_click=self.on_click)
        
        self.keyboard_listener.start()
        self.mouse_listener.start()
        
        # Start background threads
        self.saver_thread = threading.Thread(target=self.save_loop, daemon=True)
        self.monitor_thread = threading.Thread(target=self.monitor_loop, daemon=True)
        
        self.saver_thread.start()
        self.monitor_thread.start()
        
        print(f"Collector started. saving to {self.filename} every minute.")

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
                    "last_updated": ""
                }
        else:
             data = {
                "total_keys": 0,
                "total_clicks": 0,
                "total_active_seconds": 0,
                "total_idle_seconds": 0,
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
        # 3. Update Progress Counters (Temporary)
        self.progress_active_sec += self.active_seconds
        self.progress_idle_sec += self.idle_seconds
        self.progress_keys += self.key_presses
        
        # Persist Global Commit Count
        # We need to load it first if we want robustness, but for now we just write what we tracked
        # Actually, let's load it in init or save_data read phase.
        # But 'data' dict is local here.
        data["total_commits_detected"] = data.get("total_commits_detected", 0) + self.total_commits_all_time
        # Reset local all time buffer so we don't double count on next save (since we read -> add -> write)
        self.total_commits_all_time = 0

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
        import random
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
            # Find a house without terrace
            candidates = [h for h in houses if h.get('obstacle') != 'tree' and not h.get('has_terrace')]
            if candidates:
                # Pick random? Or first? Random is better
                import random
                target = random.choice(candidates)
                target['has_terrace'] = True
                rewards_triggered = True

        if rewards_triggered and generate_city_slots:
            self.recalculate_and_save(houses, houses_path, roads_path)

    def recalculate_and_save(self, entities, h_path, r_path):
        """Recalculates positions and saves files"""
        import random 
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
                    if 'has_terrace' not in ent: ent['has_terrace'] = False
                    
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

    def check_github_activity(self):
        """Polls GitHub Events API for new commits"""
        if not self.github_username: return
        
        print(f"Checking GitHub for {self.github_username}...")
        url = f"https://api.github.com/users/{self.github_username}/events/public"
        try:
            r = requests.get(url, timeout=5)
            if r.status_code != 200: return
            
            events = r.json()
            # Look for PushEvents
            # We need to find NEW commits since last check.
            # Using simplest logic: checking the ID of the latest PushEvent.
            # If changed, count the commits in payload.
            
            # Filter for PushEvents
            push_events = [e for e in events if e.get('type') == 'PushEvent']
            if not push_events: return
            
            latest_id = push_events[0]['id']
            
            if self.last_commit_id is None:
                # First run, just mark the point, don't award retroactive
                self.last_commit_id = latest_id
                print(f"GitHub Baseline Set: {latest_id}")
                return
                
            if latest_id == self.last_commit_id:
                return # No new pushes
                
            # New Pushes found!
            # Count commits between latest_id and last_commit_id
            new_commits = 0
            curr_id = latest_id
            
            for e in push_events:
                if e['id'] == self.last_commit_id: break
                
                # Add size
                payload = e.get('payload', {})
                size = payload.get('size', 1) # Default 1 if missing
                new_commits += size
                
            self.last_commit_id = latest_id
            
            if new_commits > 0:
                print(f">>> GitHub Activity: +{new_commits} Commits Detected!")
                self.commit_credits += new_commits
                self.total_commits_all_time += new_commits
                
                # Check Threshold (1 Commit -> 1 House)
                while self.commit_credits >= self.THRESHOLD_GIT_HOUSE:
                    self.commit_credits -= self.THRESHOLD_GIT_HOUSE
                    self.on_github_reward()
                    
        except Exception as e:
            print(f"GitHub Check Error: {e}")

    def on_github_reward(self):
        """Builds a special 'git_post' house"""
        print(">>> REWARD: GIT HOUSE UNLOCKED!")
        if self.on_reward: self.on_reward("Git Tower Built! 🐙", "10 Commits pushed! A new tower rises.")
        
        houses_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visualizer", "stargazers_houses.json")
        roads_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "visualizer", "roads.json")
        
        try:
            with open(houses_path, 'r') as f:
                houses = json.load(f)
                
            houses.append({
                "type": "git_post",
                "login": f"Commit Node #{random.randint(100,999)}",
                # Placeholder, will be fixed by recalculate
                "x": 0, "y": 0,
                "color": "#00e152", # Fallback
                "facing": "right" 
            })
            
            if generate_city_slots:
                self.recalculate_and_save(houses, houses_path, roads_path)
                
        except Exception as e:
            print(f"Error building Git House: {e}")

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
            # Update world state logic less frequently? 
            self.update_world_state()
            
            # Check GitHub every 60 seconds (approx)
            if int(time.time()) % 60 == 0:
                self.check_github_activity()
            
            time.sleep(1)

    def save_loop(self):
        while self.running:
            time.sleep(self.save_interval_sec)
            self.save_data()

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
