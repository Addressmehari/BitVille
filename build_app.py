import sys
import subprocess

def install_pyinstaller():
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

def build():
    print("Building GitVille Activity Tracker...")
    
    # Define assets to include (source;dest)
    # On Windows, path separator is ; for pyinstaller add-data
    assets = [
        "home;home",
        "visualizer;visualizer",
        "datas;datas",
        "settings.json;."
    ]
    
    cmd = [
        sys.executable, "-m", "PyInstaller", # Run as module to be safe
        "--noconsole",          # Don't show terminal window
        "--onefile",            # Single EXE (Clean distribution)
        "--name=GitVille",      # Name of the EXE
        "--hidden-import=PIL",  # Ensure Pillow is found
        "--hidden-import=pystray",
        "--hidden-import=tkinter",
        "--collect-all=pywebview", # Webview needs many things
        "tray_app.py"           # Main entry point
    ]
    
    # Add data arguments
    for asset in assets:
        cmd.extend(["--add-data", asset])
        
    print("Running:", " ".join(cmd))
    subprocess.call(cmd)
    
    print("\n[SUCCESS] Build complete!")
    print("Find your app in the 'dist' folder: GitVille.exe")

if __name__ == "__main__":
    try:
        import PyInstaller
    except ImportError:
        print("PyInstaller not found. Installing...")
        install_pyinstaller()
        
    build()
