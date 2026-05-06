import os
import json
import time
import requests
from datetime import datetime
from pathlib import Path

localtesting = 0
ROOT = Path(__file__).resolve().parent.parent
LOCAL_DATA_ROOT = ROOT / 'data'
DATA_ROOT = LOCAL_DATA_ROOT if localtesting else Path('/var/www/rtracker/data')

# --- CONFIGURATION ---
DATA_DIR = DATA_ROOT / 'games'
SITE_DIR = DATA_ROOT / 'site'
CONFIG_FILE = os.path.join(SITE_DIR, "games.json")
BASE_URL = "https://badges.roblox.com/v1/universes/{}/badges?limit=100"

# Ensure root directories exist
os.makedirs(DATA_DIR, exist_ok=True)

def fetch_all_badges(universe_id):
    """Fetches every single badge for a game using pagination."""
    badges = []
    cursor = None
    while True:
        url = BASE_URL.format(universe_id)
        if cursor:
            url += f"&cursor={cursor}"
        try:
            res = requests.get(url, timeout=10)
            if res.status_code != 200:
                print(f"!!! API Error for {universe_id}: {res.status_code}")
                break

            data = res.json()
            badges.extend(data.get("data", []))

            cursor = data.get("nextPageCursor")
            if not cursor:
                break
            time.sleep(1.0) # Avoid hitting page limits too fast
        except Exception as e:
            print(f"!!! Fetch error for {universe_id}: {e}")
            break
    return badges

def process_game_badges(universe_id):
    uid_str = str(universe_id)
    badge_folder = os.path.join(DATA_DIR, uid_str, "badges")
    os.makedirs(badge_folder, exist_ok=True)

    new_badge_data = fetch_all_badges(uid_str)
    if not new_badge_data:
        return

    today_ts = int(time.time())
    index_list = []

    for badge in new_badge_data:
        bid = str(badge['id'])
        stats = badge.get("statistics", {})

        # FIX: Roblox uses 'awardedCount' for the total in this endpoint
        total_awards = stats.get("awardedCount", 0)
        daily_awards = stats.get("pastDayAwardedCount", 0)
        win_rate = stats.get("winRatePercentage", 0)

        # 1. Update Individual Historical File
        history_path = os.path.join(badge_folder, f"{bid}.json")
        history = []
        if os.path.exists(history_path):
            try:
                with open(history_path, "r") as f: history = json.load(f)
            except: pass

        history.append({
                "t": today_ts,
                "a": daily_awards,
                "total": total_awards # Now this will be 3305475 instead of 0
            })

        # Save historical data minified (Keep last 365 days)
        with open(history_path, "w") as f:
            json.dump(history[-365:], f, separators=(',', ':'))

        # 2. Build the Index Entry
        index_list.append({
                "id": badge['id'],
                "n": badge.get("name", "Unknown"),
                "d": badge.get("description", ""),
                "icon": badge.get("iconImageId", 0),
                "total": total_awards, # Fixed here too
                "win": win_rate,
                "updated": badge.get("updated")
            })

    # 3. Save the Game's Badge Index
    index_path = os.path.join(badge_folder, "index.json")
    with open(index_path, "w") as f:
        json.dump(index_list, f, indent=2)

    print(f"-> Processed {len(index_list)} badges for {uid_str}")

def main():
    if not os.path.exists(CONFIG_FILE):
        print("Error: games.json not found.")
        return

    with open(CONFIG_FILE, "r") as f:
        u_ids = json.load(f).get("universeIds", [])

    print(f"--- Badge Update Cycle: {len(u_ids)} games ---")
    for i, uid in enumerate(u_ids):
        print(f"[{i+1}/{len(u_ids)}] Updating {uid}...")
        process_game_badges(uid)
        time.sleep(2.0) # Respectful delay between different games

if __name__ == "__main__":
    main()
