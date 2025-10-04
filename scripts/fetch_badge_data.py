import os
import json
import time
import requests
from datetime import datetime

CONFIG_PATH = "../config.json"
OUTPUT_DIR = "../data/badges"
BASE_URL = "https://badges.roblox.com/v1/universes/{}/badges?sortBy=Rank&limit=100&sortOrder=Asc"

# Ensure output directory exists
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Load universe IDs from config
with open(CONFIG_PATH, "r") as f:
    config = json.load(f)
universe_ids = config.get("universeIds", [])

# Get current date for stats tracking
today = datetime.utcnow().strftime("%Y-%m-%d")

def fetch_badges(universe_id):
    badges = []
    cursor = None
    while True:
        url = BASE_URL.format(universe_id)
        if cursor:
            url += f"&cursor={cursor}"
        try:
            res = requests.get(url, timeout=10)
            if res.status_code != 200:
                print(f"Failed to fetch for {universe_id} - {res.status_code}")
                return []
            data = res.json()
            badges.extend(data.get("data", []))
            cursor = data.get("nextPageCursor")
            if not cursor:
                break
            time.sleep(1.5)  # Delay between pages
        except Exception as e:
            print(f"Error fetching {universe_id}: {e}")
            break
    return badges

def update_badge_file(universe_id, new_badges):
    path = os.path.join(OUTPUT_DIR, f"{universe_id}.json")
    if os.path.exists(path):
        with open(path, "r") as f:
            existing = json.load(f)
    else:
        existing = {}

    for badge in new_badges:
        badge_id = str(badge["id"])
        if badge_id not in existing:
            existing[badge_id] = {}

        # Copy non-stat fields (overwrite)
        for key in badge:
            if key != "statistics":
                existing[badge_id][key] = badge[key]

        # Append to statistics history
        stats = badge.get("statistics", {})
        if "statistics" not in existing[badge_id]:
            existing[badge_id]["statistics"] = {}
        for stat_name, stat_value in stats.items():
            if stat_name not in existing[badge_id]["statistics"]:
                existing[badge_id]["statistics"][stat_name] = []
            existing[badge_id]["statistics"][stat_name].append({
                "date": today,
                "value": stat_value
            })

    with open(path, "w") as f:
        json.dump(existing, f, indent=2)

# Main loop
for i, universe_id in enumerate(universe_ids):
    print(f"[{i+1}/{len(universe_ids)}] Fetching badges for Universe ID: {universe_id}")
    badges = fetch_badges(universe_id)
    if badges:
        update_badge_file(universe_id, badges)
        print(f"Saved {len(badges)} badges for Universe ID: {universe_id}")
    else:
        print(f"No badges or failed request for Universe ID: {universe_id}")
    time.sleep(2.5)  # Delay between universe requests
