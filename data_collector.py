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
    def __init__(self, filename="datas/activity_log.json"):
        self.filename = filename
        
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
        
        # Thresholds (Reduced for Testing)
        self.THRESHOLD_HOUSE = 10       # 10 active seconds -> 1 House
        self.THRESHOLD_TREE = 10        # 10 idle seconds -> 1 Tree
        self.THRESHOLD_UPGRADE = 50     # 50 keys -> 1 Upgrade


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
        self.progress_keys += self.key_presses

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
            # Add House
            count = len([h for h in houses if h.get('type') == 'activity_house'])
            houses.append({
                "type": "activity_house",
                "login": f"Active_Session_{count+1}",
                # Placeholder, will be fixed by recalculate
                "x": 0, "y": 0 
            })
            rewards_triggered = True

        # B. Trees (Idle Time)
        while self.progress_idle_sec >= self.THRESHOLD_TREE:
            self.progress_idle_sec -= self.THRESHOLD_TREE
            print(">>> REWARD: New Tree Planted!")
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
            # Find a house without terrace
            candidates = [h for h in houses if h.get('obstacle') != 'tree' and noth.get('has_terrace')]
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

    def monitor_loop(self):
        """Checks idle status every second"""
        while self.running:
            idle = get_idle_duration()
            if idle < self.idle_threshold_sec:
                self.active_seconds += 1
            else:
                self.idle_seconds += 1
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
