import pystray
from PIL import Image, ImageDraw
import threading
import sys
import os
import subprocess

import ctypes

# Set AppUserModelID so notifications show "GitVille" instead of "Python"
try:
    myappid = 'gitville.activity.tracker.v1'
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except Exception:
    pass

from data_collector import DataCollector

def create_image():
    # Create high-res image for anti-aliasing
    size = 256
    image = Image.new('RGBA', (size, size), (0,0,0,0))
    dc = ImageDraw.Draw(image)
    
    # 1. Background: Deep Gradient (Blue to Purple)
    # Simulating gradient by drawing lines
    c1 = (43, 88, 118)  # #2b5876
    c2 = (78, 67, 118)  # #4e4376
    
    # Rounded Mask
    mask = Image.new('L', (size, size), 0)
    mask_dc = ImageDraw.Draw(mask)
    mask_dc.rounded_rectangle((0, 0, size, size), radius=60, fill=255)
    
    # Draw Gradient
    for y in range(size):
        r = int(c1[0] + (c2[0] - c1[0]) * y / size)
        g = int(c1[1] + (c2[1] - c1[1]) * y / size)
        b = int(c1[2] + (c2[2] - c1[2]) * y / size)
        dc.line([(0, y), (size, y)], fill=(r, g, b))
        
    # Apply Mask (Composite)
    # Instead of complex masking, we can just clear corners if we want transparent background,
    # but let's just draw the gradient in a rounded rect fashion?
    # PIL draw.rounded_rectangle doesn't support gradient fill.
    # So we composite:
    gradient = image.copy()
    image = Image.new('RGBA', (size, size), (0,0,0,0))
    image.paste(gradient, (0,0), mask=mask)
    dc = ImageDraw.Draw(image)
    
    # 2. Border (Glowing Cyan/Teal)
    dc.rounded_rectangle((2, 2, size-2, size-2), radius=60, outline="#5ee7df", width=6)

    # 3. Icon: Stylized House (White)
    # Center: 128, 128
    # House Base: 100 wide, 80 tall
    # Roof: Triangle
    
    house_color = "#ffffff"
    
    # Coordinates (Centered)
    cx, cy = size//2, size//2
    w = 120
    h = 90
    
    # Base
    base_left = cx - w//2
    base_right = cx + w//2
    base_top = cy - h//2 + 30 # Shift down a bit
    base_bottom = cy + h//2 + 30
    
    dc.rectangle((base_left, base_top, base_right, base_bottom), fill=house_color)
    
    # Roof (Triangle)
    roof_h = 70
    roof_pts = [
        (cx - w//2 - 20, base_top), # Left Overhang
        (cx, base_top - roof_h),    # Peak
        (cx + w//2 + 20, base_top)  # Right Overhang
    ]
    dc.polygon(roof_pts, fill=house_color)
    
    # Door (Cutout - Dark)
    door_w = 40
    door_h = 50
    dc.rectangle((cx - door_w//2, base_bottom - door_h, cx + door_w//2, base_bottom), fill="#4e4376")
    
    # Window (Cutout - Dark)
    win_size = 30
    dc.rectangle((cx - win_size//2, base_top + 20, cx + win_size//2, base_top + 20 + win_size), fill="#4e4376")
    
    # 4. Resize to 64x64 (High Quality)
    image = image.resize((64, 64), Image.Resampling.LANCZOS)
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

    def open_map(self):
        # Open visualizer_app.py
        script_path = os.path.join(os.getcwd(), 'visualizer_app.py')
        subprocess.Popen([sys.executable, script_path])

    def open_stats(self):
        # Open input_visualizer.py
        script_path = os.path.join(os.getcwd(), 'input_visualizer.py')
        subprocess.Popen([sys.executable, script_path])

    def run(self):
        # Create the icon
        image = create_image()
        menu = pystray.Menu(
            pystray.MenuItem("Tracker Running", lambda: None, enabled=False),
            pystray.MenuItem("View Map", self.open_map),
            pystray.MenuItem("View Stats", self.open_stats),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Save Now", lambda: self.collector.save_data()),
            pystray.MenuItem("Exit", self.on_quit)
        )
        
        self.icon = pystray.Icon("ActivityTracker", image, "My Tracker", menu)
        self.icon.run()

if __name__ == "__main__":
    app = SystemTrayTracker()
    app.run()
