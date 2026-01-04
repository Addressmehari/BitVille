import os
import threading
try:
    import webview
except ImportError:
    print("pywebview is not installed. Please run: pip install pywebview")
    import sys
    sys.exit(1)

import ctypes

def main():
    # Calculate path to the HTML file
    cpath = os.getcwd()
    html_file = os.path.join(cpath, 'visualizer', 'index.html')
    
    if not os.path.exists(html_file):
        print(f"File not found: {html_file}")
        return
        
    # Create file URL
    file_url = f"file:///{html_file.replace(os.sep, '/')}"
    print(f"Opening: {file_url}")
    
    # Calculate Center
    width = 800
    height = 600
    
    try:
        user32 = ctypes.windll.user32
        screen_width = user32.GetSystemMetrics(0)
        screen_height = user32.GetSystemMetrics(1)
        x = (screen_width - width) // 2
        y = (screen_height - height) // 2
    except Exception as e:
        print(f"Error getting screen size: {e}")
        x = None
        y = None
    
    # Create the window directly
    webview.create_window(
        'My Visualizer', 
        file_url, 
        width=width, 
        height=height,
        x=x,
        y=y
    )
    
    # Start the webview (blocking call)
    webview.start()

if __name__ == "__main__":
    main()
