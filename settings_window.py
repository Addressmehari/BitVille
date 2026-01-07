import tkinter as tk
from tkinter import ttk, messagebox
import json
import os

class SettingsWindow(tk.Tk):
    def __init__(self):
        super().__init__()
        
        self.title("Stats Tracker Settings")
        self.geometry("400x450")
        self.configure(bg="#1e1e24")
        
        # Paths
        self.settings_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'settings.json')
        
        # Load Data
        self.data = self.load_data()
        
        # UI Styles
        style = ttk.Style()
        style.theme_use('clam')
        style.configure("TLabel", background="#1e1e24", foreground="white", font=("Segoe UI", 10))
        style.configure("TButton", background="#3b82f6", foreground="white", font=("Segoe UI", 10, "bold"), borderwidth=0)
        style.map("TButton", background=[("active", "#2563eb")])
        style.configure("TEntry", fieldbackground="#2b2b36", foreground="white", borderwidth=0)
        
        # Header
        header = tk.Label(self, text="Configuration", font=("Segoe UI", 16, "bold"), bg="#1e1e24", fg="white")
        header.pack(pady=20)
        
        container = tk.Frame(self, bg="#1e1e24")
        container.pack(fill='both', expand=True, padx=30)
        
        # Fields
        self.create_field(container, "Github Username", "github_username")
        self.create_field(container, "Commits per Post", "git_post_threshold")
        tk.Label(container, text="--- Thresholds ---", bg="#1e1e24", fg="#666").pack(pady=10)
        self.create_field(container, "Active Seconds (House)", "threshold_house")
        self.create_field(container, "Idle Seconds (Tree)", "threshold_tree")
        self.create_field(container, "Key Presses (Upgrade)", "threshold_upgrade")
        
        # Save Button
        btn_frame = tk.Frame(self, bg="#1e1e24")
        btn_frame.pack(pady=20, fill='x')
        
        save_btn = ttk.Button(btn_frame, text="Save Settings", command=self.save_settings)
        save_btn.pack(side='left', expand=True, padx=10, ipadx=10)
        
        # Reset Button (Red style attempt using label/frame mimicry since ttk style is hard)
        # Or just a normal button with warning text
        reset_btn = tk.Button(btn_frame, text="RESET DATA", command=self.reset_data, 
                             bg="#ef4444", fg="white", font=("Segoe UI", 9, "bold"), 
                             relief="flat", activebackground="#dc2626", activeforeground="white")
        reset_btn.pack(side='right', expand=True, padx=10, ipadx=10, ipady=5)
        
    def load_data(self):
        defaults = {
            "github_username": "Addressmehari",
            "git_post_threshold": 10,
            "threshold_house": 300,
            "threshold_tree": 300,
            "threshold_upgrade": 1000
        }
        if os.path.exists(self.settings_file):
            try:
                with open(self.settings_file, 'r') as f:
                    return json.load(f)
            except:
                return defaults
        return defaults

    def create_field(self, parent, label_text, key):
        frame = tk.Frame(parent, bg="#1e1e24")
        frame.pack(fill='x', pady=5)
        
        lbl = tk.Label(frame, text=label_text, width=20, anchor='w', bg="#1e1e24", fg="#aaaaaa", font=("Segoe UI", 9))
        lbl.pack(side='left')
        
        val = self.data.get(key, "")
        var = tk.StringVar(value=str(val))
        entry = tk.Entry(frame, textvariable=var, bg="#2b2b36", fg="white", font=("Segoe UI", 10), relief="flat", insertbackground="white")
        entry.pack(side='right', fill='x', expand=True, ipady=3)
        
        # Store var for later retrieval
        if not hasattr(self, 'vars'): self.vars = {}
        self.vars[key] = var

    def reset_data(self):
        confirm = messagebox.askyesno("Confirm Reset", 
                                      "Are you sure you want to WIPEOUT all your city and stats?\n\nThis cannot be undone.", 
                                      icon='warning')
        if not confirm:
            return
            
        try:
            # Paths
            base_dir = os.path.dirname(os.path.abspath(__file__))
            v_dir = os.path.join(base_dir, 'visualizer')
            d_dir = os.path.join(base_dir, 'datas')
            
            # Reset Files
            files = {
                os.path.join(v_dir, 'stargazers_houses.json'): [],
                os.path.join(v_dir, 'roads.json'): [],
                os.path.join(d_dir, 'activity_log.json'): {
                    "total_keys": 0, "total_clicks": 0, 
                    "total_active_seconds": 0, "total_idle_seconds": 0, 
                    "total_commits": 0, "progress_commits": 0,
                    "last_updated": ""
                },
                os.path.join(v_dir, 'construction_state.json'): {} # Reset this too
            }
            
            for path, content in files.items():
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, 'w') as f:
                    json.dump(content, f, indent=4)
                    
            messagebox.showinfo("Reset Complete", "All data has been erased.\n\nPlease EXT and RESTART the tracker app from the system tray for changes to take absolute effect.")
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to reset data: {e}")

    def save_settings(self):
        new_data = {}
        try:
            new_data["github_username"] = self.vars["github_username"].get().strip()
            new_data["git_post_threshold"] = int(self.vars["git_post_threshold"].get())
            new_data["threshold_house"] = int(self.vars["threshold_house"].get())
            new_data["threshold_tree"] = int(self.vars["threshold_tree"].get())
            new_data["threshold_upgrade"] = int(self.vars["threshold_upgrade"].get())
            
            with open(self.settings_file, 'w') as f:
                json.dump(new_data, f, indent=4)
                
            messagebox.showinfo("Success", "Settings saved!\nPlease restart the tracker for changes to take effect.")
            self.destroy()
        except ValueError:
            messagebox.showerror("Error", "Please enter valid numbers for thresholds.")
        except Exception as e:
            messagebox.showerror("Error", str(e))

def run_app():
    app = SettingsWindow()
    app.mainloop()

if __name__ == "__main__":
    run_app()
