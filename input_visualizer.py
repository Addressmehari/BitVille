import os
import sys
import threading
import time

try:
    import webview
except ImportError:
    print("pywebview is not installed. Please run: pip install pywebview")
    sys.exit(1)

import json

class Api:
    def get_data(self):
        # Path to user_inputs.json in home/ directory
        # Persistence: MUST be in valid write location.
        if getattr(sys, 'frozen', False):
            # In frozen mode, data should be in the directory of the executable, 
            # NOT in _MEIPASS (which is temporary).
            # We follow the same logic as glass_window fallback: root of exe or home/ inside it if present.
            base_dir = os.path.dirname(sys.executable)
            possible_home = os.path.join(base_dir, 'home')
            if os.path.exists(possible_home):
                cpath = possible_home
            else:
                cpath = base_dir
            # Filename is just user_inputs.json in that cpath
            json_file = os.path.join(cpath, 'user_inputs.json')
        else:
            cpath = os.path.dirname(os.path.abspath(__file__))
            json_file = os.path.join(cpath, 'home', 'user_inputs.json')
        
        if not os.path.exists(json_file):
            return []
            
        try:
            with open(json_file, 'r') as f:
                content = json.load(f)
                return content
        except Exception as e:
            print(f"Error reading JSON: {e}")
            return []

def main():
    # Calculate path to the new HTML file in home/
    if getattr(sys, 'frozen', False):
        cpath = sys._MEIPASS # For HTML assets, use bundled
    else:
        cpath = os.path.dirname(os.path.abspath(__file__))
    html_file = os.path.join(cpath, 'home', 'index.html')
    
    if not os.path.exists(html_file):
        print(f"File not found: {html_file}")
        return
        
    file_url = f"file:///{html_file.replace(os.sep, '/')}"
    print(f"Opening: {file_url}")
    
    api = Api()
    
    # Window Dimensions (Landscape)
    width = 1200
    height = 800
    
    webview.create_window(
        'Activity Feed', 
        file_url, 
        width=width, 
        height=height,
        resizable=True,
        js_api=api
    )
    
    webview.start(debug=False)

if __name__ == "__main__":
    main()
