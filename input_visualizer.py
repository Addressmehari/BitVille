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
