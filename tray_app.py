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

    def launch_process(self, arg, script_name):
        try:
            if getattr(sys, 'frozen', False):
                subprocess.Popen([sys.executable, arg])
            else:
                script_path = os.path.join(os.getcwd(), script_name)
                subprocess.Popen([sys.executable, script_path])
        except Exception as e:
            print(f"Failed to launch {script_name}: {e}")

    def open_map(self):
        self.launch_process('--map', 'visualizer_app.py')

    def open_stats(self):
        self.launch_process('--stats', 'input_visualizer.py')

    def open_settings(self):
        self.launch_process('--settings', 'settings_window.py')

    def run(self):
        # Startup Launch: Glass Window
        self.launch_process('--glass', 'home/glass_window.py')

        # Create the icon
        image = create_image()
        menu = pystray.Menu(
            pystray.MenuItem("Tracker Running", lambda: None, enabled=False),
            pystray.MenuItem("View Map", self.open_map),
            pystray.MenuItem("View Stats", self.open_stats),
            pystray.MenuItem("Settings", self.open_settings),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Save Now", lambda: self.collector.save_data()),
            pystray.MenuItem("Exit", self.on_quit)
        )
        
        self.icon = pystray.Icon("ActivityTracker", image, "My Tracker", menu)
        self.icon.run()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        mode = sys.argv[1]
        
        if mode == '--glass':
            sys.path.append(os.path.join(os.getcwd(), 'home'))
            from home.glass_window import run_app
            run_app()
            
        elif mode == '--map':
            import visualizer_app
            visualizer_app.main()
            
        elif mode == '--stats':
            import input_visualizer
            input_visualizer.main()
            
        elif mode == '--settings':
            import settings_window
            settings_window.run_app()
            
    else:
        # Mode: Tray Tracker
        app = SystemTrayTracker()
        app.run()
