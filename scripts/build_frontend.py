import json
import shutil
from pathlib import Path

localtesting = 1
ROOT = Path(__file__).resolve().parent.parent
LOCAL_DATA_ROOT = ROOT / 'data'
DATA_ROOT = LOCAL_DATA_ROOT if localtesting else Path('/var/www/rtracker/data')
DATA_GAMES = DATA_ROOT / 'games'
DATA_GROUPS = DATA_ROOT / 'groups'
SITE_ROOT = DATA_ROOT / 'site'

PAGE_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RTracker</title>
  <link rel="stylesheet" href="{css_path}">
  <script src="https://code.highcharts.com/highcharts.js"></script>
  <script defer src="{js_path}"></script>
</head>
<body>
  <div class="page-shell">
    <header class="topbar">
      <div>
        <a class="brand" data-nav="true" href="{root_href}">RTracker</a>
        <p class="subtitle">Dark analytics for Roblox games.</p>
      </div>
    </header>
    <main id="app" class="page-content"></main>
  </div>
</body>
</html>
'''


def create_placeholder(path, depth):
    css_path = '../' * depth + 'app.css'
    js_path = '../' * depth + 'app.js'
    root_href = '../' * depth
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(PAGE_TEMPLATE.format(css_path=css_path, js_path=js_path, root_href=root_href), encoding='utf-8')


def copy_game_assets(game_id):
    source = DATA_GAMES / game_id
    target = SITE_ROOT / 'games' / game_id
    target.mkdir(parents=True, exist_ok=True)
    for name in ['metadata.json', '1d.json', 'latest.json']:
        source_file = source / name
        if source_file.exists():
            shutil.copy2(source_file, target / name)
    badges_source = source / 'badges'
    if badges_source.exists() and badges_source.is_dir():
        target_badges = target / 'badges'
        target_badges.mkdir(parents=True, exist_ok=True)
        for badge_file in badges_source.glob('*.json'):
            if badge_file.name == 'index.json':
                shutil.copy2(badge_file, target_badges / badge_file.name)
                continue
            shutil.copy2(badge_file, target_badges / badge_file.name)


def copy_group_assets(group_id):
    source = DATA_GROUPS / group_id
    target = SITE_ROOT / 'groups' / group_id
    target.mkdir(parents=True, exist_ok=True)
    for source_file in source.glob('*.json'):
        shutil.copy2(source_file, target / source_file.name)


def build():
    SITE_ROOT.mkdir(parents=True, exist_ok=True)
    games_root = SITE_ROOT / 'games'
    games_root.mkdir(parents=True, exist_ok=True)

    create_placeholder(games_root / 'index.html', depth=1)
    for game_dir in sorted(DATA_GAMES.iterdir()):
        if not game_dir.is_dir():
            continue
        game_id = game_dir.name
        copy_game_assets(game_id)
        create_placeholder(games_root / game_id / 'index.html', depth=2)
        badges_source = game_dir / 'badges'
        if badges_source.exists() and badges_source.is_dir():
            for badge_file in badges_source.glob('*.json'):
                if badge_file.name == 'index.json':
                    continue
                badge_id = badge_file.stem
                create_placeholder(games_root / game_id / badge_id / 'index.html', depth=3)

    groups_root = SITE_ROOT / 'groups'
    groups_root.mkdir(parents=True, exist_ok=True)
    create_placeholder(groups_root / 'index.html', depth=1)
    for group_dir in sorted(DATA_GROUPS.iterdir()):
        if not group_dir.is_dir():
            continue
        group_id = group_dir.name
        copy_group_assets(group_id)
        create_placeholder(groups_root / group_id / 'index.html', depth=2)

    add_root = SITE_ROOT / 'add'
    add_root.mkdir(parents=True, exist_ok=True)
    create_placeholder(add_root / 'index.html', depth=1)

    create_placeholder(SITE_ROOT / '404.html', depth=0)
    print('Frontend wrapper pages created for games, badges, and groups.')


if __name__ == '__main__':
    build()
