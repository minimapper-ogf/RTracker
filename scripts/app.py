import subprocess
import time
import datetime
import os

# Get the absolute path of the current folder
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Track last minute run to avoid duplicate runs in same minute
last_checked_minute = None

def run_script(script_name):
    print(f"Running {script_name}...")
    subprocess.run(["python", os.path.join(SCRIPT_DIR, script_name)], check=True)

while True:
    now = datetime.datetime.now()
    current_minute = now.minute
    current_hour = now.hour

    # Prevent running multiple times in same minute
    if current_minute != last_checked_minute:
        last_checked_minute = current_minute

        # Every 10 minutes (0, 10, 20, ..., 50)
        if current_minute % 10 == 0:
            run_script("fetch_game_data.py")
            run_script("generate_game_page.py")

        # Exactly 12:00 PM
        if current_hour == 12 and current_minute == 0:
            run_script("fetch_game_data_daily.py")
            run_script("generate_game_page_daily.py")
            run_script("fetch_badge_data.py")
            run_script("generate_badge_page.py")

    # Sleep a bit before checking again
    time.sleep(10)
