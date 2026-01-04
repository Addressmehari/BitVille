import pystray
from PIL import Image, ImageDraw
import threading
import sys
import os

# Import your existing collector logic
# Make sure data_collector.py allows importing DataCollector class without auto-running main!
# We might need to tweak data_collector.py slightly to ensure strict class usage.
# For now, we assume we can import it.
from data_collector import DataCollector

def create_image():
    # Generate an image for the icon (a simple colored circle)
    width = 64
    height = 64
    color1 = "black"
    color2 = "#00A2E8"

    image = Image.new('RGB', (width, height), color1)
    dc = ImageDraw.Draw(image)
    dc.ellipse((16, 16, 48, 48), fill=color2)
    
    return image

class SystemTrayTracker:
    def __init__(self):
        self.collector = DataCollector()
        self.icon = None

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
