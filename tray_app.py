import pystray
from PIL import Image, ImageDraw
import threading
import sys
import os

import ctypes

# Set AppUserModelID so notifications show "GitVille" instead of "Python"
try:
    myappid = 'gitville.activity.tracker.v1'
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except Exception:
    pass

from data_collector import DataCollector

def create_image():
    # Draw a cute pixel-art style house icon
    width = 64
    height = 64
    image = Image.new('RGBA', (width, height), (0,0,0,0)) # Transparent bg
    dc = ImageDraw.Draw(image)
    
    # House Body (White/Cream)
    dc.rectangle((16, 28, 48, 56), fill="#fdfbf7", outline="#2c3e50", width=2)
    # Roof (Red)
    dc.polygon([(10, 28), (32, 8), (54, 28)], fill="#e74c3c", outline="#c0392b", width=2)
    # Door (Brown)
    dc.rectangle((28, 40, 36, 56), fill="#8d6e63", outline="#5d4037", width=2)
    # Window (Blue)
    dc.rectangle((20, 34, 26, 40), fill="#74b9ff", outline="#2980b9", width=1)
    dc.rectangle((38, 34, 44, 40), fill="#74b9ff", outline="#2980b9", width=1)
    
    return image

class SystemTrayTracker:
    def __init__(self):
        self.collector = DataCollector(on_reward=self.notify_reward)
        self.icon = None

    def notify_reward(self, title, msg):
        if self.icon:
             self.icon.notify(msg, title)

    def on_quit(self, icon, item):
        print("Stopping collector...")
        self.collector.save_data()
        self.collector.stop()
        icon.stop()
        os._exit(0) # Force exit to kill threads

    def run(self):
        # Create the icon
        image = create_image()
        menu = pystray.Menu(
            pystray.MenuItem("Tracker Running", lambda: None, enabled=False),
            pystray.MenuItem("Save Now", lambda: self.collector.save_data()),
            pystray.MenuItem("Exit", self.on_quit)
        )
        
        self.icon = pystray.Icon("ActivityTracker", image, "My Tracker", menu)
        self.icon.run()

if __name__ == "__main__":
    app = SystemTrayTracker()
    app.run()
