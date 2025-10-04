import os
import json
from jinja2 import Environment, FileSystemLoader

# Setup Jinja environment
template_path = "../templates/"
env = Environment(loader=FileSystemLoader(template_path))

def generate_game_pages(json_folder, output_folder):
    os.makedirs(output_folder, exist_ok=True)
    game_template = env.get_template("games_daily.html")
    games = []

    for file in os.listdir(json_folder):
        if file.endswith(".json"):
            universe_id = file.replace(".json", "")
            json_path = os.path.join(json_folder, file)

            with open(json_path, mode="r", encoding="utf-8") as jsonfile:
                data = json.load(jsonfile)

            metadata = data.get("metadata", {})
            history = data.get("history", [])

            if not history:
                continue  # skip if no history

            latest = history[-1]

            game_name = metadata.get("name", "Unknown Game")
            player_count = latest.get("playing", 0)

            description = metadata.get("description") or "No description available."
            description = description.strip()  # just in case
            short_description = description[:97].rstrip() + "..." if len(description) > 97 else description
            like_count = latest.get("upVotes", 0)
            favorite_count = latest.get("favoritedCount", 0)
            genre = metadata.get("genre", "Unknown")
            creator = metadata.get("creator", {}).get("name", "Unknown")
            max_players = metadata.get("maxPlayers", 0)
            created = metadata.get("created", "Unknown")
            updated = metadata.get("updated", "Unknown")
            price = metadata.get("price", "Free")
            copying_allowed = metadata.get("copyingAllowed", False)
            universe_avatar_type = metadata.get("universeAvatarType", "Unknown")

            games.append({
                "universe_id": universe_id,
                "name": game_name,
                "player_count": player_count,
                "description": description,
                "short_description": short_description,
                "like_count": like_count,
                "favorite_count": favorite_count,
                "genre": genre,
                "creator": creator,
                "max_players": max_players,
                "created": created,
                "updated": updated,
                "price": price,
                "copying_allowed": copying_allowed,
                "universe_avatar_type": universe_avatar_type,
            })

            # Extract time series data from history for details page
            timestamps = [entry["timestamp"] for entry in history]
            playing = [entry.get("playing", 0) for entry in history]
            visits = [entry.get("visits", 0) for entry in history]
            favoritedCount = [entry.get("favoritedCount", 0) for entry in history]
            upVotes = [entry.get("upVotes", 0) for entry in history]
            downVotes = [entry.get("downVotes", 0) for entry in history]

            visitschange = [visits[i] - visits[i-1] if i > 0 else 0 for i in range(len(visits))]
            favoritedchange = [favoritedCount[i] - favoritedCount[i-1] if i > 0 else 0 for i in range(len(favoritedCount))]
            upVoteschange = [upVotes[i] - upVotes[i-1] if i > 0 else 0 for i in range(len(upVotes))]
            downVoteschange = [downVotes[i] - downVotes[i-1] if i > 0 else 0 for i in range(len(downVotes))]

            upVotespercentage = [
                (upVotes[i] / (upVotes[i] + downVotes[i])) * 100 if (upVotes[i] + downVotes[i]) > 0 else 0
                for i in range(len(upVotes))
            ]

            # Render stats page
            output_html = game_template.render(
                game_name=game_name,
                timestamps=json.dumps(timestamps),
                playing=json.dumps(playing),
                visits=json.dumps(visits),
                visitschange=json.dumps(visitschange),
                favoritedCount=json.dumps(favoritedCount),
                favoritedchange=json.dumps(favoritedchange),
                upVotes=json.dumps(upVotes),
                downVotes=json.dumps(downVotes),
                upVoteschange=json.dumps(upVoteschange),
                downVoteschange=json.dumps(downVoteschange),
                upVotespercentage=json.dumps(upVotespercentage),
                playing_current=playing[-1],
                playing_max=max(playing),
                visits_current=visits[-1],
                visits_max=max(visits),
                favorited_current=favoritedCount[-1],
                favorited_max=max(favoritedCount),
                upvotes_pct_current=round(upVotespercentage[-1], 2),

                # NEW FIELDS NEEDED BY TEMPLATE
                daily_peak_players=max(playing),
                daily_peak_visits=max(visits),
                daily_peak_favorites=max(favoritedCount),
                daily_peak_upvote_pct=round(max(upVotespercentage), 2),

                # Additional metadata fields for template
                description=description,
                like_count=like_count,
                favorite_count=favorite_count,
                genre=genre,
                creator=creator,
                max_players=max_players,
                created=created,
                updated=updated,
                price=price,
                copying_allowed=copying_allowed,
                universe_avatar_type=universe_avatar_type
            )

            output_file = os.path.join(output_folder, f"{universe_id}.html")
            with open(output_file, "w", encoding="utf-8") as htmlfile:
                htmlfile.write(output_html)

    # Sort games by current player count descending for home page
    games.sort(key=lambda x: x["player_count"], reverse=True)
    return games



# Define paths
json_folder = "../data/games/daily"
output_folder = "../site/games"

# Run generator
games = generate_game_pages(json_folder, output_folder)


print(f"HTML pages and home page generated in: {output_folder}")
