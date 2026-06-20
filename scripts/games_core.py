import requests
import os
import json
import time
from datetime import datetime, timedelta
from pathlib import Path

localtesting = 0
ROOT = Path(__file__).resolve().parent.parent
LOCAL_DATA_ROOT = ROOT / 'data'
DATA_ROOT = LOCAL_DATA_ROOT if localtesting else Path('/var/www/rtracker/data')

# --- CONFIGURATION & PATHS ---
DATA_DIR = DATA_ROOT / 'games'
SITE_DIR = DATA_ROOT / 'site'
CONFIG_FILE = os.path.join(SITE_DIR, "games.json")
MASTER_LIST = os.path.join(SITE_DIR, "scheduler.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(SITE_DIR, exist_ok=True)

def get_next_aligned_time(now, interval_mins):
    # Calculate the next occurrence based on fixed clock positions
    if interval_mins >= 1440: # Daily
        target = now + timedelta(days=1)
        return target.replace(hour=0, minute=0, second=0, microsecond=0)

    if interval_mins >= 60: # Hourly or Multi-hour (e.g., 12h)
        hours_to_add = interval_mins // 60
        # Find next hour divisible by the interval (e.g., for 12h: 00:00 or 12:00)
        current_hour = now.hour
        next_hour = ((current_hour // hours_to_add) + 1) * hours_to_add

        if next_hour >= 24:
            target = now + timedelta(days=1)
            return target.replace(hour=0, minute=0, second=0, microsecond=0)
        return now.replace(hour=next_hour, minute=0, second=0, microsecond=0)

    # Sub-hourly (10m, 30m)
    minutes_to_add = interval_mins
    next_minute = ((now.minute // minutes_to_add) + 1) * minutes_to_add

    if next_minute >= 60:
        target = now + timedelta(hours=1)
        return target.replace(minute=0, second=0, microsecond=0)
    return now.replace(minute=next_minute, second=0, microsecond=0)

def get_resolution_info(universe_id):
    uid_str = str(universe_id)
    game_folder = os.path.join(DATA_DIR, uid_str)
    meta_path = os.path.join(game_folder, "metadata.json")

    # 1. Calculate/Update the average gain before deciding resolution
    avg_gain = update_avg_daily_gain(game_folder)

    # 2. Threshold logic
    if avg_gain < 50:
        return "1d", 1440
    if avg_gain < 1000:
        return "1h", 60
    if avg_gain < 10000:
        return "30m", 30

    # Default for new games (avg_gain 10000+) or high performers
    return "10m", 10

def update_avg_daily_gain(game_folder):
    meta_path = os.path.join(game_folder, "metadata.json")

    # Default to 5000 so new games start at 10m resolution
    avg_gain = 5000

    # Prefer 1d.json for daily averages, but fall back to latest.json as needed.
    for file_name in ["1d.json", "latest.json"]:
        history_path = os.path.join(game_folder, file_name)
        if not os.path.exists(history_path):
            continue
        try:
            with open(history_path, "r") as f:
                history = json.load(f)

            if len(history) >= 2:
                sample_size = min(len(history), 7)
                recent_data = history[-sample_size:]
                total_gain = recent_data[-1].get("visits", 0) - recent_data[0].get("visits", 0)
                days = max(1, sample_size - 1)
                avg_gain = total_gain / days
                break
        except Exception as e:
            print(f"Calculation error for {game_folder}: {e}")

    # Save the calculated value back to metadata
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r") as f:
                meta = json.load(f)
            meta["avg_daily_gain"] = avg_gain
            with open(meta_path, "w") as f:
                json.dump(meta, f, indent=2)
        except: pass

    return avg_gain

def fetch_roblox_data(universe_ids):
    """Fetches details, votes, and favorites in batches of 50."""
    if not universe_ids: return []
    results = []
    for i in range(0, len(universe_ids), 50):
        batch = universe_ids[i:i + 50]
        ids_str = ",".join(map(str, batch))
        try:
            # Multi-API Call
            g_res = requests.get(f"https://games.roblox.com/v1/games?universeIds={ids_str}")
            v_res = requests.get(f"https://games.roblox.com/v1/games/votes?universeIds={ids_str}")

            # Fetch Favorites (Universe IDs work here too)
            f_res = requests.get(f"https://games.roblox.com/v1/games/favorites?universeIds={ids_str}")

            g_data = g_res.json().get("data", [])
            v_data = v_res.json().get("data", [])
            f_data = f_res.json() # Returns a list directly or in 'data' depending on version

            # Map votes and favorites for quick lookup
            v_lookup = {item['id']: item for item in v_data}

            # Roblox sometimes returns favorites as a list of dicts with 'universeId' or 'id'
            f_lookup = {}
            favorites_items = f_data if isinstance(f_data, list) else f_data.get("data", [])
            for item in favorites_items:
                universe_key = item.get("universeId") or item.get("id")
                if universe_key is None:
                    continue
                f_lookup[str(universe_key)] = item.get("favoritedCount", item.get("favorites", 0) or 0)

            for game in g_data:
                game_id_str = str(game['id'])
                results.append({
                    "universeId": game['id'],
                    "full": game,
                    "votes": v_lookup.get(game['id'], {}),
                    "favs": game.get("favoritedCount", 0)
                })
            time.sleep(0.5)
        except Exception as e:
            print(f"!!! API Error: {e}")
    return results

def get_peak_players(game_folder):
    peak = 0
    for res_file in ["latest.json", "1d.json", "10m.json", "30m.json", "1h.json"]:
        path = os.path.join(game_folder, res_file)
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                    day_ago = int(time.time()) - 86400
                    recent_points = [p.get("players", 0) for p in data if p.get("time", 0) > day_ago]
                    if recent_points:
                        file_max = max(recent_points)
                        if file_max > peak: peak = file_max
            except: pass
    return peak


def compute_1d_visit_gain(game_folder):
    # Check latest.json first since it has high-resolution recent data, fall back to 1d.json
    for file_name in ["latest.json", "1d.json"]:
        history_path = os.path.join(game_folder, file_name)
        if not os.path.exists(history_path):
            continue
        try:
            with open(history_path, "r") as f:
                history = json.load(f)
            if not isinstance(history, list) or len(history) < 2:
                continue

            last_point = history[-1]
            last_time = last_point.get("time", 0)
            last_visits = last_point.get("visits", 0)

            # Target timestamp exactly 24 hours before the latest point
            target_time = last_time - 86400

            # Find the point closest to target_time
            closest_point = None
            smallest_delta = float('inf')

            for point in history:
                p_time = point.get("time", 0)
                delta = abs(p_time - target_time)
                if delta < smallest_delta:
                    smallest_delta = delta
                    closest_point = point

            # Ensure we found a valid historical data point to compare against
            if closest_point and closest_point != last_point:
                return max(0, last_visits - closest_point.get("visits", 0))
        except:
            continue
    return 0


def save_game_data(item, res, is_midnight=False):
    uid = str(item['universeId'])
    game_folder = os.path.join(DATA_DIR, uid)
    os.makedirs(game_folder, exist_ok=True)

    # 1. Update Metadata
    meta_path = os.path.join(game_folder, "metadata.json")
    metadata = item["full"]
    metadata["favorites"] = item["favs"]

    # Logic for new games: check if we have enough points for resolution switching
    # (Existing avg_gain logic remains inside update_avg_daily_gain)
    metadata["avg_daily_gain"] = update_avg_daily_gain(game_folder)

    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)

    # 2. Prepare Standard Data Point (Current Stats)
    up = item["votes"].get("upVotes", 0)
    down = item["votes"].get("downVotes", 0)
    new_entry = {
        "time": int(time.time()),
        "players": item["full"].get("playing", 0),
        "visits": item["full"].get("visits", 0),
        "favorites": item["favs"],
        "likes": up,
        "dislikes": down,
        "ratio": round((up/(up+down)*100), 4) if (up+down) > 0 else 0
    }

    # 3. Save to Resolution File & Latest (Always maintain latest for the UI)
    for target_file in [f"{res}.json", "latest.json"]:
        if target_file == "1d.json": continue # Skip 1d here, we handle it below
        path = os.path.join(game_folder, target_file)
        data = []
        if os.path.exists(path):
            try:
                with open(path, "r") as f: data = json.load(f)
            except: data = []

        data.append(new_entry)
        # Keep latest.json trimmed to 7 days
        if target_file == "latest.json":
            cutoff = int(time.time()) - 7 * 86400
            data = [p for p in data if p.get("time", 0) >= cutoff]

        with open(path, "w") as f:
            json.dump(data, f, indent=2)

    # 4. Handle Midnight / 1d Logic (Recording Daily Peak)
    if is_midnight or res == "1d":
        daily_path = os.path.join(game_folder, "1d.json")
        daily_data = []
        if os.path.exists(daily_path):
            try:
                with open(daily_path, "r") as f: daily_data = json.load(f)
            except: daily_data = []

        # Look back through all high-res files to find the true peak players
        true_peak = get_peak_players(game_folder)

        daily_entry = new_entry.copy()
        daily_entry["players"] = max(new_entry["players"], true_peak)

        daily_data.append(daily_entry)
        with open(daily_path, "w") as f:
            json.dump(daily_data, f, indent=2)

def rebuild_frontend_index():
    """Compiles the most recent data for all games into one sortable file."""
    index_path = os.path.join(SITE_DIR, "games_index.json")
    all_games_data = []

    # Get the list of game folders
    game_folders = [f for f in os.listdir(DATA_DIR) if os.path.isdir(os.path.join(DATA_DIR, f))]

    for uid in game_folders:
        meta_path = os.path.join(DATA_DIR, uid, "metadata.json")
        if os.path.exists(meta_path):
            try:
                with open(meta_path, "r") as f:
                    meta = json.load(f)

                # Extract only the "Table View" essentials
                # Most of the numeric values are available in history, not always metadata.
                up = meta.get("upVotes", meta.get("likes", 0) or 0)
                down = meta.get("downVotes", meta.get("dislikes", 0) or 0)
                favorites = meta.get("favorites", meta.get("favoritedCount", 0) or 0)
                ratio = round((up/(up+down)*100), 2) if (up+down) > 0 else 0

                entry = {
                    "id": uid,
                    "n": meta.get("name", "Unknown"),
                    "p": meta.get("playing", 0),
                    "v": meta.get("visits", 0),
                    "f": favorites,
                    "l": up,
                    "d": down,
                    "r": ratio,
                    "v24": meta.get("v24", 0)
                }

                # Prefer the most recent history snapshot for table values when metadata is incomplete.
                for candidate in ["latest.json", "10m.json", "30m.json", "1h.json", "1d.json"]:
                    history_path = os.path.join(DATA_DIR, uid, candidate)
                    if not os.path.exists(history_path):
                        continue
                    try:
                        hist = json.load(open(history_path, "r"))
                        if isinstance(hist, list) and hist:
                            last = hist[-1]
                            entry.update({
                                "p": last.get("players", entry["p"]),
                                "v": last.get("visits", entry["v"]),
                                "f": last.get("favorites", entry["f"]),
                                "l": last.get("likes", entry["l"]),
                                "d": last.get("dislikes", entry["d"]),
                                "r": last.get("ratio", entry["r"])
                            })
                            break
                    except: pass
                entry["v24"] = compute_1d_visit_gain(os.path.join(DATA_DIR, uid))
                all_games_data.append(entry)
            except: pass

    with open(index_path, "w") as f:
        # Minifying this one is good practice since it's the most-fetched file
        json.dump(all_games_data, f, separators=(',', ':'))

    print(f"Index rebuilt: {len(all_games_data)} games indexed.")

def main():
    print(f"--- Tracker Heartbeat: {datetime.now().strftime('%Y-%m-%d %H:%M')} ---")
    if not os.path.exists(CONFIG_FILE):
        print("Error: games.json not found.")
        return

    with open(CONFIG_FILE, "r") as f:
        universe_ids = json.load(f).get("universeIds", [])

    master_list = {}
    if os.path.exists(MASTER_LIST):
        with open(MASTER_LIST, "r") as f:
            master_list = json.load(f)

    now = datetime.now()
    is_midnight = (now.hour == 0 and now.minute < 5)

    due_ids = []
    for uid in universe_ids:
        uid_str = str(uid)

        game_folder = os.path.join(DATA_DIR, uid_str)
        latest_path = os.path.join(game_folder, "latest.json")

        point_count = 0
        if os.path.exists(latest_path):
            try:
                with open(latest_path, "r") as f:
                    data = json.load(f)
                    point_count = len(data) if isinstance(data, list) else 0
            except: pass

        if uid_str not in master_list:
            due_ids.append(uid)
        else:
            if point_count < 5:
                next_fetch = datetime.strptime(master_list[uid_str]["next_fetch"], "%Y-%m-%d %H:%M:%S")
                if next_fetch <= now:
                    due_ids.append(uid)
            elif is_midnight:
                due_ids.append(uid)
            else:
                next_fetch = datetime.strptime(master_list[uid_str]["next_fetch"], "%Y-%m-%d %H:%M:%S")
                if next_fetch <= now:
                    due_ids.append(uid)

    if not due_ids:
        print("Status: All games up to date.")
        return

    print(f"Status: Fetching {len(due_ids)} games...")
    results = fetch_roblox_data(due_ids)

    for item in results:
        uid_str = str(item["universeId"])

        game_folder = os.path.join(DATA_DIR, uid_str)
        latest_path = os.path.join(game_folder, "latest.json")

        point_count = 0
        if os.path.exists(latest_path):
            try:
                with open(latest_path, "r") as f:
                    data = json.load(f)
                    point_count = len(data) if isinstance(data, list) else 0
            except: pass

        if point_count < 5:
            res, interval = "10m", 10
        else:
            res, interval = get_resolution_info(uid_str)

        save_game_data(item, res, is_midnight=is_midnight)

        # Schedule next run
        next_run = get_next_aligned_time(now, interval)
        master_list[uid_str] = {
            "name": item["full"].get("name", "Unknown"),
            "res": res,
            "next_fetch": next_run.strftime("%Y-%m-%d %H:%M:%S"),
            "updated": now.strftime("%Y-%m-%d %H:%M")
        }

    with open(MASTER_LIST, "w") as f:
        json.dump(master_list, f, indent=2)

    print("Success: Master list updated.")
    rebuild_frontend_index()
if __name__ == "__main__":
    main()
