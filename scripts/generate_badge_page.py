import os
import json
from jinja2 import Environment, FileSystemLoader
from datetime import datetime

# Paths
template_path = "../templates/"
json_folder = "../data/badges"
site_base_folder = "../site/games/"

# Setup Jinja2 environment
env = Environment(loader=FileSystemLoader(template_path))
badge_template = env.get_template("badges.html")
index_template = env.get_template("games_badges_page.html")

def generate_badge_pages(json_folder, site_base_folder):
    universe_badges = {}

    for file in os.listdir(json_folder):
        if not file.endswith(".json"):
            continue

        json_path = os.path.join(json_folder, file)
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        for badge_id, badge_data in data.items():
            badge_name = badge_data.get("name", "Unknown Badge")
            badge_description = badge_data.get("description", "")
            badge_icon_id = badge_data.get("iconImageId", "")
            badge_icon = f"https://tr.rbxcdn.com/{badge_icon_id}-256-256.png" if badge_icon_id else ""
            awarded_count = badge_data.get("statistics", {}).get("awardedCount", [{}])[0].get("value", 0)
            awarded_today = badge_data.get("statistics", {}).get("pastDayAwardedCount", [{}])[0].get("value", 0)
            win_rate = badge_data.get("statistics", {}).get("winRatePercentage", [{}])[0].get("value", 0.0) * 100
            created = badge_data.get("created", "Unknown")
            updated = badge_data.get("updated", "Unknown")
            universe_info = badge_data.get("awardingUniverse", {})
            universe_name = universe_info.get("name", "Unknown Universe")
            universe_id = universe_info.get("id")

            if not universe_id:
                continue

            # Collect badge summary for the index
            badge_summary = {
                "id": badge_id,
                "name": badge_name,
                "description": badge_description,
                "icon": badge_icon,
                "awarded_count": awarded_count,
                "rarity": win_rate,
                "created": created,
            }

            # Add to universe group
            universe_badges.setdefault(universe_id, {
                "universe_name": universe_name,
                "badges": []
            })["badges"].append(badge_summary)

            # Generate individual badge pages
            awarded_count_data = []
            awarded_today_data = []
            rarity_data = []

            def convert_series(series):
                return [
                    [int(datetime.fromisoformat(x["date"]).timestamp()) * 1000, x["value"]]
                    for x in series if "value" in x and "date" in x
                ]

            awarded_count_data = convert_series(badge_data.get("statistics", {}).get("awardedCount", []))
            awarded_today_data = convert_series(badge_data.get("statistics", {}).get("pastDayAwardedCount", []))
            rarity_data = convert_series(badge_data.get("statistics", {}).get("winRatePercentage", []))

            output_folder = os.path.join(site_base_folder, str(universe_id))
            os.makedirs(output_folder, exist_ok=True)
            output_path = os.path.join(output_folder, f"{badge_id}.html")

            html_content = badge_template.render(
                badge_name=badge_name,
                badge_description=badge_description,
                badge_icon=badge_icon,
                awarded_count=awarded_count,
                awarded_today=awarded_today,
                created=created,
                updated=updated,
                awarded_count_data=json.dumps(awarded_count_data),
                awarded_today_data=json.dumps(awarded_today_data),
                rarity_data=json.dumps(rarity_data),
                universe_name=universe_name,
                universe_id=universe_id
            )

            with open(output_path, "w", encoding="utf-8") as outfile:
                outfile.write(html_content)
            print(f"Generated: {output_path}")

    # Generate badge index pages per universe
    for universe_id, data in universe_badges.items():
        folder = os.path.join(site_base_folder, str(universe_id))
        index_path = os.path.join(folder, "index.html")
        html_index = index_template.render(
            universe_id=universe_id,
            universe_name=data["universe_name"],
            badges=data["badges"]
        )
        with open(index_path, "w", encoding="utf-8") as idxfile:
            idxfile.write(html_index)
        print(f"Generated index: {index_path}")

if __name__ == "__main__":
    generate_badge_pages(json_folder, site_base_folder)
