import os
import sys
import webbrowser
import uvicorn
from config import PORT

# Fix Windows terminal UTF-8 encoding
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

def start_studio():
    print("=" * 70)
    print(" 🚀 TELEGRAM SYNC & SIDE-BY-SIDE MIRROR STUDIO - MASTER LAUNCHER")
    print("=" * 70)
    print(" ✅ Module 1: Telethon Message Interceptor & Listener  [RUNNING]")
    print(" ✅ Module 2: Text Modifier & n8n Auto-Post Engine     [RUNNING]")
    print(" ✅ Module 3: Side-by-Side Studio Web App               [RUNNING]")
    print("=" * 70)
    print(f" 🌐 Server URL: http://localhost:{PORT}")
    print(" 💡 Press Ctrl+C to stop the server at any time.")
    print("=" * 70 + "\n")

    # Auto-open dashboard in default browser after short delay
    try:
        webbrowser.open(f"http://localhost:{PORT}")
    except Exception as e:
        print(f"Notice: Could not auto-open browser: {e}")

    # Start main FastAPI + Telethon server
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)

if __name__ == "__main__":
    start_studio()
