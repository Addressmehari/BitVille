import os
import sys
import threading
import time

try:
    import webview
except ImportError:
    print("pywebview is not installed. Please run: pip install pywebview")
    sys.exit(1)

def main():
    # Calculate path to the new HTML file in home/
    cpath = os.getcwd()
    html_file = os.path.join(cpath, 'home', 'index.html')
    
    if not os.path.exists(html_file):
        print(f"File not found: {html_file}")
        return
        
    file_url = f"file:///{html_file.replace(os.sep, '/')}"
    print(f"Opening: {file_url}")
    
    # Window Dimensions (Landscape)
    width = 1200
    height = 800
    
    webview.create_window(
        'Activity Feed', 
        file_url, 
        width=width, 
        height=height,
        resizable=True
    )
    
    webview.start(debug=False)

if __name__ == "__main__":
    main()
