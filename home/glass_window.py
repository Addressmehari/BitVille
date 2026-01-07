import tkinter as tk
import ctypes
from ctypes import windll, c_int, c_size_t, c_void_p, byref, Structure

# ----------------- Windows API Structures ----------------- #
class ACCENT_POLICY(Structure):
    _fields_ = [
        ("AccentState", c_int),
        ("AccentFlags", c_int),
        ("GradientColor", c_int),
        ("AnimationId", c_int)
    ]

class WINDOWCOMPOSITIONATTRIBDATA(Structure):
    _fields_ = [
        ("Attribute", c_int),
        ("Data", c_void_p),
        ("SizeOfData", c_size_t)
    ]

# Enums
ACCENT_DISABLED = 0
ACCENT_ENABLE_GRADIENT = 1
ACCENT_ENABLE_TRANSPARENTGRADIENT = 2
ACCENT_ENABLE_BLURBEHIND = 3  # Standard blur, most reliable with alpha
ACCENT_ENABLE_ACRYLICBLURBEHIND = 4 
WCA_ACCENT_POLICY = 19

# DWM Enums for Rounded Corners and Border (Windows 11)
DWMWA_WINDOW_CORNER_PREFERENCE = 33
DWMWA_BORDER_COLOR = 34
DWMWCP_ROUND = 2

def apply_blur(hwnd):
    """
    Applies the blur effect.
    We use BLURBEHIND combined with Tkinter's alpha.
    """
    accent = ACCENT_POLICY()
    accent.AccentState = ACCENT_ENABLE_BLURBEHIND
    accent.AccentFlags = 0
    accent.GradientColor = 0
    accent.AnimationId = 0
    
    accent_ptr = ctypes.pointer(accent)
    
    data = WINDOWCOMPOSITIONATTRIBDATA()
    data.Attribute = WCA_ACCENT_POLICY
    data.Data = ctypes.cast(accent_ptr, c_void_p)
    data.SizeOfData = ctypes.sizeof(accent)
    
    windll.user32.SetWindowCompositionAttribute(hwnd, byref(data))

def hex_to_colorref(hex_str):
    # 0x00BBGGRR
    hex_str = hex_str.lstrip('#')
    r, g, b = int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16)
    return (b << 16) | (g << 8) | r

def set_dwm_attributes(hwnd):
    # 1. Rounded Corners
    try:
        preference = c_int(DWMWCP_ROUND)
        windll.dwmapi.DwmSetWindowAttribute(
            hwnd, 
            DWMWA_WINDOW_CORNER_PREFERENCE, 
            byref(preference), 
            ctypes.sizeof(preference)
        )
    except Exception:
        pass
        
    # 2. Border Color (Windows 11 builds 22000+)
    try:
        # Set to Black: 0x00000000
        # If we want a different color, use hex_to_colorref
        color = c_int(0x00000000) # Check: COLORREF is DWORD (c_ulong) but usually c_int works
        windll.dwmapi.DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            byref(color),
            ctypes.sizeof(color)
        )
    except Exception:
        pass

# ----------------- Glass App ----------------- #

import json
import os
from datetime import datetime

# ... (Previous imports kept)

# ----------------- Glass App ----------------- #

class GlassApp(tk.Tk):
    def __init__(self):
        super().__init__()
        
        self.title("Glass Input")
        
        # Calculate Target Position (Center)
        screen_width = self.winfo_screenwidth()
        screen_height = self.winfo_screenheight()
        window_width = 400
        window_height = 300
        
        self.target_x = (screen_width - window_width) // 2
        self.target_y = (screen_height - window_height) // 2
        self.start_y = screen_height  # Start just below the screen
        
        # Initialize at start position
        self.geometry(f"{window_width}x{window_height}+{self.target_x}+{self.start_y}")
        self.overrideredirect(True)      
        
        # Color and Alpha
        self.config(bg='#050505') # Very dark black tint
        self.attributes("-alpha", 0.85) # Transparent enough for glass effect
        
        # Border
        self.config(highlightthickness=1, highlightbackground="black", highlightcolor="black")
        
        # Bindings for dragging
        self.bind("<ButtonPress-1>", self.start_move)
        self.bind("<ButtonRelease-1>", self.stop_move)
        self.bind("<B1-Motion>", self.do_move)
        
        self.after(10, self.setup_window)

        # UI Content
        # Close Button
        close_lbl = tk.Label(self, text="✕", font=("Arial", 14), fg="#aaaaaa", bg='#050505', cursor="hand2")
        close_lbl.place(x=370, y=10)
        close_lbl.bind("<Button-1>", lambda e: self.destroy())
        close_lbl.bind("<Enter>", lambda e: close_lbl.config(fg="white"))
        close_lbl.bind("<Leave>", lambda e: close_lbl.config(fg="#aaaaaa"))

        # Container for centering
        container = tk.Frame(self, bg='#050505')
        container.pack(expand=True, fill='both', padx=40)

        # Spacer
        tk.Label(container, bg='#050505').pack(pady=20)

        # Question Label
        self.question_label = tk.Label(container, text="What are you gonna do?", 
                         font=("Segoe UI", 16, "bold"), 
                         fg="white", 
                         bg='#050505')
        self.question_label.pack(pady=(0, 20), anchor="center")
        
        # Entry Field
        self.entry = tk.Entry(container, 
                              font=("Segoe UI", 12), 
                              bg="#222222", # Slightly lighter than bg for contrast
                              fg="white", 
                              insertbackground="white", 
                              relief="flat", 
                              justify="center",
                              highlightthickness=1, 
                              highlightbackground="#444444",
                              highlightcolor="#00A2E8")
        self.entry.pack(fill='x', ipady=8)
        self.entry.bind("<Return>", self.save_answer)
        self.entry.focus_set()

        # Status/Feedback Label
        self.status_label = tk.Label(container, text="", font=("Segoe UI", 9), fg="#00A2E8", bg='#050505')
        self.status_label.pack(pady=10, anchor="center")

    def animate_window(self, current_y):
        # Lerp (Linear Interpolation) for smooth, fast movement
        # Formula: current = current + (target - current) * alpha
        alpha = 0.2 # Adjust this for speed (0.1 = slow, 0.3 = fast)
        
        target = self.target_y
        diff = target - current_y
        
        # Snap to target if very close
        if abs(diff) < 1:
            self.geometry(f"+{self.target_x}+{target}")
            return
            
        new_y = current_y + (diff * alpha)
        
        # Apply integer position
        self.geometry(f"+{self.target_x}+{int(new_y)}")
        self.after(10, lambda: self.animate_window(new_y))

    def save_answer(self, event):
        answer = self.entry.get().strip()
        if not answer:
            return

        script_dir = os.path.dirname(os.path.abspath(__file__))
        filename = os.path.join(script_dir, "user_inputs.json")
        
        # Load existing data
        data = []
        if os.path.exists(filename):
            try:
                with open(filename, 'r') as f:
                    data = json.load(f)
                    if not isinstance(data, list):
                        data = []
            except (json.JSONDecodeError, IOError):
                data = []
        
        # Append new answer
        entry_record = {
            "question": "What are you gonna do?",
            "answer": answer,
            "timestamp": datetime.now().isoformat()
        }
        data.append(entry_record)
        
        # Save back to file
        try:
            with open(filename, 'w') as f:
                json.dump(data, f, indent=4)
        except Exception as e:
            print(f"Error saving: {e}")
            
        # Close the app
        self.destroy()

    def setup_window(self):
        hwnd = windll.user32.GetParent(self.winfo_id())
        apply_blur(hwnd)
        set_dwm_attributes(hwnd)
        
        # Force Taskbar Appearance
        GWL_EXSTYLE = -20
        WS_EX_APPWINDOW = 0x00040000
        WS_EX_TOOLWINDOW = 0x00000080
        
        style = windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        style = (style & ~WS_EX_TOOLWINDOW) | WS_EX_APPWINDOW
        windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style)
        
        # Re-assert window state to update taskbar
        self.withdraw()
        self.after(20, self.deiconify)
        
        # Start Animation after window is ready
        self.after(30, lambda: self.animate_window(self.start_y))
    
    def start_move(self, event):
        self.x = event.x
        self.y = event.y

    def stop_move(self, event):
        self.x = None
        self.y = None

    def do_move(self, event):
        deltax = event.x - self.x
        deltay = event.y - self.y
        x = self.winfo_x() + deltax
        y = self.winfo_y() + deltay
        self.geometry(f"+{x}+{y}")

def run_app():
    app = GlassApp()
    app.mainloop()

if __name__ == "__main__":
    run_app()
