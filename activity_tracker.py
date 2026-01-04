import ctypes
import time
from pynput import keyboard
from ctypes import Structure, windll, c_uint, sizeof, byref

# 1. Idle Time Tracker (Windows API) ------------------------------
class LASTINPUTINFO(Structure):
    _fields_ = [
        ('cbSize', c_uint),
        ('dwTime', c_uint),
    ]

def get_idle_duration():
    """Returns the number of seconds since the last user input (mouse or key)."""
    lastInputInfo = LASTINPUTINFO()
    lastInputInfo.cbSize = sizeof(lastInputInfo)
    
    # GetLastInputInfo returns 0 on failure
    if windll.user32.GetLastInputInfo(byref(lastInputInfo)):
        # GetTickCount() is the current system uptime in ms
        millis = windll.kernel32.GetTickCount() - lastInputInfo.dwTime
        return millis / 1000.0
    return 0

# 2. Typing Tracker (Global Hook) ---------------------------------
class KeyTracker:
    def __init__(self):
        self.word_count = 0
        self.char_count = 0
        self.last_key = None
        
        # Start listener in non-blocking mode
        self.listener = keyboard.Listener(on_release=self.on_release)
        self.listener.start()
        
    def on_release(self, key):
        try:
            # Simple heuristic: Space or Enter usually ends a "word"
            if key == keyboard.Key.space or key == keyboard.Key.enter:
                # Only count as word if we typed characters before
                self.word_count += 1
            elif hasattr(key, 'char'):
                self.char_count += 1
        except Exception:
            pass

# 3. Main Loop ----------------------------------------------------
if __name__ == "__main__":
    tracker = KeyTracker()
    print("Tracking started... (Press Ctrl+C to stop)")
    print(f"{'Idle (s)':<10} | {'Chars':<10} | {'Est. Words':<10}")
    print("-" * 40)
    
    try:
        while True:
            idle_sec = get_idle_duration()
            
            # Print status every second, overwriting the line for clean output
            print(f"\r{idle_sec:<10.2f} | {tracker.char_count:<10} | {tracker.word_count:<10}", end="")
            
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("\nStopped.")
