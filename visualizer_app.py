import os
import json
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
    
    # API Class for communication
    class Api:
        def get_data(self):
            try:
                with open('activity_log.json', 'r') as f:
                    return json.load(f)
            except Exception as e:
                return {"error": str(e)}

        def get_map(self):
            if not os.path.exists('map.json'):
                return {"entities": []}
            try:
                with open('map.json', 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error reading map: {e}")
                return {"entities": []}

        def save_map(self, data):
            try:
                with open('map.json', 'w') as f:
                    json.dump(data, f, indent=4)
                return {"status": "ok"}
            except Exception as e:
                return {"error": str(e)}

    # Create the window directly
    webview.create_window(
        'My Visualizer', 
        file_url, 
        width=800, 
        height=600,
        x=x,
        y=y,
        js_api=Api()
    )
    
    # Start the webview (blocking call)
    webview.start(debug=False)

if __name__ == "__main__":
    main()
