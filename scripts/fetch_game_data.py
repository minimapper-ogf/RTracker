import requests
import os
import time
import json
from datetime import datetime, timedelta

SLEEP = 600  # seconds
DATA_DIR = "../data/games/normal"

def fetch_game_data(universe_ids):
    base_url_games = "https://games.roblox.com/v1/games"
    base_url_votes = "https://games.roblox.com/v1/games/votes"
    batch_size = 50
    combined_data = []

    for i in range(0, len(universe_ids), batch_size):
        batch = universe_ids[i:i + batch_size]
        universe_ids_str = ",".join(map(str, batch))

        games_url = f"{base_url_games}?universeIds={universe_ids_str}"
        votes_url = f"{base_url_votes}?universeIds={universe_ids_str}"

        try:
            games_response = requests.get(games_url)
            votes_response = requests.get(votes_url)

            games_response.raise_for_status()
            votes_response.raise_for_status()

            games_data = games_response.json().get("data", [])
            votes_data = votes_response.json().get("data", [])
            votes_lookup = {item['id']: item for item in votes_data}

            for game in games_data:
                universe_id = game['id']
                vote_data = votes_lookup.get(universe_id, {})

                combined_data.append({
                    "universeId": universe_id,
                    "full_data": game,
                    "vote_data": vote_data
                })

        except Exception as e:
            print(f"Error fetching data for batch {batch}: {e}")

    return combined_data


def prune_old_history(history):
    now = datetime.now()
    return [entry for entry in history if now - datetime.strptime(entry['timestamp'], "%Y-%m-%d %H:%M:%S") < timedelta(days=7)]


def save_to_json(data, folder_path=DATA_DIR):
    os.makedirs(folder_path, exist_ok=True)

    for item in data:
        universe_id = item["universeId"]
        game_data = item["full_data"]
        vote_data = item["vote_data"]
        file_path = os.path.join(folder_path, f"{universe_id}.json")

        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                existing = json.load(f)
        else:
            existing = {"metadata": {}, "history": []}

        # Update metadata (overwrites previous)
        existing["metadata"] = {
            "name": game_data.get("name", ""),
            "description": game_data.get("description", ""),
            "genre": game_data.get("genre", ""),
            "creator": game_data.get("creator", {}),
            "created": game_data.get("created"),
            "updated": game_data.get("updated"),
            "maxPlayers": game_data.get("maxPlayers"),
            "universeAvatarType": game_data.get("universeAvatarType"),
            "rootPlaceId": game_data.get("rootPlaceId"),
            "price": game_data.get("price"),
            "allowedGearGenres": game_data.get("allowedGearGenres"),
            "copyingAllowed": game_data.get("copyingAllowed"),
            "isFavoritedByUser": game_data.get("isFavoritedByUser", False)
        }

        # Append current metrics to history
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        up = vote_data.get("upVotes", 0)
        down = vote_data.get("downVotes", 0)
        total_votes = up + down
        upvote_percentage = round((up / total_votes) * 100, 4) if total_votes > 0 else 0.0

        current_metrics = {
            "timestamp": now_str,
            "playing": game_data.get("playing", 0),
            "visits": game_data.get("visits", 0),
            "favoritedCount": game_data.get("favoritedCount", 0),
            "upVotes": up,
            "downVotes": down,
            "upVotePercentage": upvote_percentage
        }

        existing["history"].append(current_metrics)

        # Prune old history
        existing["history"] = prune_old_history(existing["history"])

        # Save back to file
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2)


def main():
    config_file = "../config.json"
    if not os.path.exists(config_file):
        print("Missing config.json.")
        return

    with open(config_file, "r") as f:
        config = json.load(f)

    universe_ids = config.get("universeIds", [])
    loop_enabled = config.get("loopEnabled", 0)

    if not universe_ids:
        print("No universe IDs in config.")
        return

    print("Starting data tracking...")

    if loop_enabled == 0:
        while True:
            print("Fetching game data...")
            data = fetch_game_data(universe_ids)
            if data:
                print("Saving to JSON...")
                save_to_json(data)
                print("Saved.")
            else:
                print("No data fetched.")

            print(f"Sleeping for {SLEEP} seconds...")
            time.sleep(SLEEP)
    else:
        print("Fetching game data once...")
        data = fetch_game_data(universe_ids)
        if data:
            save_to_json(data)
            print("Data saved.")
        else:
            print("No data fetched.")


if __name__ == "__main__":
    main()
