import requests
import os
import json
import time
from datetime import datetime
from pathlib import Path

localtesting = 0
ROOT = Path(__file__).resolve().parent.parent
LOCAL_DATA_ROOT = ROOT / 'data'
DATA_ROOT = LOCAL_DATA_ROOT if localtesting else Path('/var/www/rtracker/data')

# --- CONFIGURATION ---
DATA_DIR = DATA_ROOT
SITE_DIR = DATA_ROOT / 'site'
GROUPS_DIR = DATA_ROOT / 'groups'
GAMES_CONFIG = os.path.join(SITE_DIR, "games.json")
GROUPS_CONFIG = os.path.join(SITE_DIR, "groups.json")
GROUPS_INDEX = os.path.join(SITE_DIR, "groups_index.json") # The new "Big Seller" file
GAMES_INDEX_DATA = os.path.join(SITE_DIR, "index.json") # To pull visit counts

os.makedirs(GROUPS_DIR, exist_ok=True)

def fetch_group_details(group_id):
    try:
        res = requests.get(f"https://groups.roblox.com/v1/groups/{group_id}")
        return res.json()
    except Exception as e:
        print(f"!!! Error fetching group {group_id}: {e}")
        return None

def fetch_group_games(group_id):
    universes = []
    cursor = None
    while True:
        url = f"https://games.roblox.com/v2/groups/{group_id}/games?accessFilter=All&sortOrder=Asc&limit=100"
        if cursor: url += f"&cursor={cursor}"
        try:
            res = requests.get(url)
            data = res.json()
            games_list = data.get("data", [])
            for game in games_list:
                universes.append({
                    "universeId": game.get("id"),
                    "name": game.get("name"),
                    "playing": game.get("playerCount", 0)
                })
            cursor = data.get("nextPageCursor")
            if not cursor: break
        except: break
    return universes

def update_group_data(group_id, global_game_data):
    gid_str = str(group_id)
    folder = os.path.join(GROUPS_DIR, gid_str)
    os.makedirs(folder, exist_ok=True)

    details = fetch_group_details(group_id)
    games_from_api = fetch_group_games(group_id)

    if not details: return None

    # Calculate Aggregates
    total_players = sum(g.get('playing', 0) for g in games_from_api)

    # Accurate Visit Count: Try to find visit counts from our existing games index
    total_visits = 0
    for g in games_from_api:
        uid_str = str(g['universeId'])
        if uid_str in global_game_data:
            total_visits += global_game_data[uid_str].get('v', 0)

    discovered_uids = [g['universeId'] for g in games_from_api]

    # 1. Save Detailed Metadata (metadata.json)
    shout = details.get("shout") or {}
    metadata = {
        "id": details.get("id"),
        "name": details.get("name"),
        "description": details.get("description"),
        "owner": details.get("owner"),
        "memberCount": details.get("memberCount"),
        "shout": {
            "content": shout.get("body"),
            "posted": shout.get("updated"),
            "poster": shout.get("poster", {}).get("username")
        } if shout else None,
        "games": [{"id": g['universeId'], "n": g['name']} for g in games_from_api],
        "updated": datetime.now().isoformat()
    }
    with open(os.path.join(folder, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    # 2. Auto-Discovery Logic
    if os.path.exists(GAMES_CONFIG):
        try:
            with open(GAMES_CONFIG, "r") as f:
                game_cfg = json.load(f)
            current_list = game_cfg.get("universeIds", []) if isinstance(game_cfg, dict) else game_cfg
            existing_set = set(current_list)
            added_any = False
            for uid in discovered_uids:
                if uid not in existing_set:
                    current_list.append(uid)
                    existing_set.add(uid)
                    added_any = True
            if added_any:
                if isinstance(game_cfg, dict): game_cfg["universeIds"] = current_list
                else: game_cfg = current_list
                with open(GAMES_CONFIG, "w") as f: json.dump(game_cfg, f, indent=2)
        except: pass

    # 3. Save Daily History (1d.json)
    history_path = os.path.join(folder, "1d.json")
    history = []
    if os.path.exists(history_path):
        try:
            with open(history_path, "r") as f: history = json.load(f)
        except: pass

    history.append({
        "t": int(time.time()),
        "m": details.get("memberCount", 0),
        "p": total_players,
        "v": total_visits
    })
    with open(history_path, "w") as f:
        json.dump(history[-365:], f, separators=(',', ':'))

    # Return summary for the Global Index
    return {
        "id": details.get("id"),
        "n": details.get("name"),
        "m": details.get("memberCount", 0),
        "gc": len(games_from_api),
        "p": total_players,
        "v": total_visits
    }

def main():
    if not os.path.exists(GROUPS_CONFIG): return

    with open(GROUPS_CONFIG, "r") as f:
        group_ids = json.load(f).get("groupIds", [])

    # Load existing game index to get visit counts
    global_game_data = {}
    if os.path.exists(GAMES_INDEX_DATA):
        try:
            with open(GAMES_INDEX_DATA, "r") as f:
                # Convert the index list into a dictionary for fast lookup
                temp_list = json.load(f)
                global_game_data = {str(item['id']): item for item in temp_list}
        except: pass

    groups_summary_index = []

    print(f"--- Group Update Cycle: {len(group_ids)} groups ---")
    for gid in group_ids:
        print(f"Updating Group: {gid}...")
        summary = update_group_data(gid, global_game_data)
        if summary:
            groups_summary_index.append(summary)
        time.sleep(1)

    # Save the "Big Seller" Index
    with open(GROUPS_INDEX, "w") as f:
        json.dump(groups_summary_index, f, separators=(',', ':'))
    print(f"Success! {GROUPS_INDEX} generated.")

if __name__ == "__main__":
    main()
