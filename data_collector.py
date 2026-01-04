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
    def __init__(self, filename="activity_log.json"):
        self.filename = filename
        
        # In-memory metrics
        self.key_presses = 0
        self.mouse_clicks = 0
        self.active_seconds = 0 
        self.idle_seconds = 0
        
        # Configuration
        self.save_interval_sec = 60
        self.idle_threshold_sec = 2.0 
        self.running = True

        # Start listeners
        self.keyboard_listener = keyboard.Listener(on_release=self.on_key)
        self.mouse_listener = mouse.Listener(on_click=self.on_click)
        
        self.keyboard_listener.start()
        self.mouse_listener.start()
        
        # Start background threads
        self.saver_thread = threading.Thread(target=self.save_loop)
        self.monitor_thread = threading.Thread(target=self.monitor_loop)
        
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
        
        # 3. Reset internal counters
        self.key_presses = 0
        self.mouse_clicks = 0
        self.active_seconds = 0
        self.idle_seconds = 0
        
        # 4. Save overwrite
        try:
            with open(self.filename, 'w') as f:
                json.dump(data, f, indent=4)
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Aggregated data saved.")
        except Exception as e:
            print(f"Error saving: {e}")

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
