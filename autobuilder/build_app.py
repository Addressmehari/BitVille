import os
import shutil
import subprocess
import sys
import time
import zipfile

def set_working_dir():
    """Sets the working directory to the project root (one level up from this script)."""
    # Assuming this script is in /autobuilder/ or similar, and project is in parent.
    # If script is run from project root, this path logic handles it too.
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir) # Go up one level
    
    # Check if we are already in root (e.g. if script was moved to root)
    if os.path.exists(os.path.join(script_dir, 'tray_app.py')):
        project_root = script_dir
        
    print(f"Project Root: {project_root}")
    os.chdir(project_root)

def clean_build():
    """Removes dist and build directories."""
    dirs = ['dist', 'build']
    for d in dirs:
        if os.path.exists(d):
            print(f"Removing {d}...")
            try:
                shutil.rmtree(d)
            except Exception as e:
                print(f"Error removing {d}: {e}. Retrying in 2 seconds...")
                time.sleep(2)
                try:
                    shutil.rmtree(d)
                except Exception as e2:
                    print(f"Failed to remove {d}: {e2}. Please close any running instances of the app.")
                    sys.exit(1)

def build():
    """Runs PyInstaller."""
    print("Starting GitVille build process...")
    
    # Check for PyInstaller
    try:
        subprocess.run([sys.executable, '-m', 'PyInstaller', '--version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("PyInstaller not found. Installing...")
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'pyinstaller'], check=True)

    # PyInstaller command
    sep = ';' if os.name == 'nt' else ':'
    
    command = [
        sys.executable, '-m', 'PyInstaller',
        'tray_app.py',
        '--onedir',
        '--clean',
        '--name', 'GitVille',
        '--add-data', f'visualizer{sep}visualizer',
        '--add-data', f'home{sep}home',
        '--add-data', f'settings.json{sep}.',
        '--collect-all', 'webview',
        '--collect-all', 'pystray',
        '--noconfirm',
        '--noconsole'
    ]
    
    print(f"Running command: {' '.join(command)}")
    subprocess.run(command, check=True)

def zip_and_version():
    """Zips the dist folder and saves it to versions/version_X.zip"""
    versions_dir = 'versions'
    if not os.path.exists(versions_dir):
        os.makedirs(versions_dir)
        print(f"Created '{versions_dir}' directory.")
        
    # Determine Next Version
    existing_files = os.listdir(versions_dir)
    max_version = 0
    for f in existing_files:
        if f.startswith('version_') and f.endswith('.zip'):
            try:
                # Extract number: version_1.zip -> 1
                ver_str = f.replace('version_', '').replace('.zip', '')
                val = int(ver_str)
                if val > max_version:
                    max_version = val
            except ValueError:
                pass
                
    new_version = max_version + 1
    zip_name = f"version_{new_version}.zip"
    zip_path = os.path.join(versions_dir, zip_name)
    
    dist_path = os.path.join('dist', 'GitVille')
    
    if not os.path.exists(dist_path):
        print("Error: Dist folder not found. Build failed?")
        return

    print(f"Zipping version {new_version}...")
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(dist_path):
            for file in files:
                # Create relative path in archive (e.g. GitVille/GitVille.exe)
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, start='dist')
                zipf.write(file_path, arcname)
                
    print(f"Saved: {zip_path}")

if __name__ == "__main__":
    try:
        set_working_dir()
        
        if os.path.exists("tray_app.spec"):
            try:
                os.remove("tray_app.spec")
            except: pass
            
        clean_build()
        build()
        zip_and_version()
        
        print("\n" + "="*50)
        print("ALL DONE! App built and archived.")
        print("="*50)
        
    except Exception as e:
        print(f"\nCRITICAL ERROR: {e}")
        
    input("\nPress Enter to exit...")
