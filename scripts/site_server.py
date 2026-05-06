#!/usr/bin/env python3
import json
import os
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote

import requests

localtesting = 0
ROOT = Path(__file__).resolve().parent.parent
LOCAL_DATA_ROOT = ROOT / 'data'
DATA_ROOT = LOCAL_DATA_ROOT if localtesting else Path('/var/www/rtracker/data')
SITE_DIR = DATA_ROOT / 'site'
GROUPS_CONFIG = SITE_DIR / 'groups.json'
GAMES_CONFIG = SITE_DIR / 'games.json'

class SiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith('/api/'):
            return self.handle_api_get(parsed.path)

        local_path = self.get_local_path(parsed.path)
        if not os.path.exists(local_path):
            self.path = '/index.html'
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith('/api/'):
            self.send_error(405, 'POST only allowed for /api endpoints')
            return

        if parsed.path == '/api/groups':
            return self.handle_api_add_group()
        if parsed.path == '/api/games':
            return self.handle_api_add_game()

        self.send_error(404, 'API endpoint not found')

    def handle_api_get(self, path):
        if path == '/api/groups':
            return self.send_json(self.load_json(GROUPS_CONFIG))
        if path == '/api/games':
            return self.send_json(self.load_json(GAMES_CONFIG))
        if path.startswith('/api/group/'):
            group_id = path.split('/api/group/', 1)[1]
            return self.handle_api_group(group_id)
        if path.startswith('/api/place/'):
            place_id = path.split('/api/place/', 1)[1]
            return self.handle_api_place(place_id)

        self.send_error(404, 'API endpoint not found')

    def get_local_path(self, path):
        clean_path = unquote(urlparse(path).path)
        if clean_path.endswith('/'):
            clean_path = clean_path + 'index.html'
        return os.path.join(self.directory, clean_path.lstrip('/'))

    def load_json(self, path):
        with open(path, 'r', encoding='utf-8') as handle:
            return json.load(handle)

    def write_json(self, path, data):
        with open(path, 'w', encoding='utf-8') as handle:
            json.dump(data, handle, indent=2)
            handle.write('\n')

    def read_json_body(self):
        length = int(self.headers.get('Content-Length', 0) or 0)
        raw = self.rfile.read(length) if length else b''
        return json.loads(raw.decode('utf-8') or '{}')

    def send_json(self, payload, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def handle_api_group(self, group_id):
        try:
            group_id = int(group_id)
        except ValueError:
            self.send_error(400, 'Invalid group ID')
            return

        details = self.roblox_get_json(f'https://groups.roblox.com/v1/groups/{group_id}')
        if details is None:
            self.send_error(502, 'Unable to fetch group details')
            return

        games = []
        cursor = None
        while True:
            url = f'https://games.roblox.com/v2/groups/{group_id}/games?accessFilter=All&sortOrder=Asc&limit=100'
            if cursor:
                url += f'&cursor={cursor}'
            response = self.roblox_get_json(url)
            if response is None:
                break
            for item in response.get('data', []):
                games.append({'id': item.get('id'), 'name': item.get('name')})
            cursor = response.get('nextPageCursor')
            if not cursor:
                break

        tracked = self.load_json(GROUPS_CONFIG).get('groupIds', [])
        self.send_json({
            'id': group_id,
            'name': details.get('name'),
            'memberCount': details.get('memberCount', 0),
            'gamesCount': len(games),
            'games': games,
            'description': details.get('description', ''),
            'alreadyAdded': group_id in tracked
        })

    def handle_api_place(self, place_id):
        try:
            place_id = int(place_id)
        except ValueError:
            self.send_error(400, 'Invalid place ID')
            return

        convert = self.roblox_get_json(f'https://apis.roblox.com/universes/v1/places/{place_id}/universe')
        if convert is None or 'universeId' not in convert:
            self.send_error(502, 'Unable to resolve place to universe')
            return

        universe_id = convert['universeId']
        game_data = self.roblox_get_json(f'https://games.roblox.com/v1/games?universeIds={universe_id}')
        if game_data is None or not game_data.get('data'):
            self.send_error(404, 'Universe not found')
            return

        game = game_data['data'][0]
        tracked = self.load_json(GAMES_CONFIG).get('universeIds', [])
        creator = game.get('creator') or {}
        self.send_json({
            'placeId': place_id,
            'universeId': universe_id,
            'name': game.get('name'),
            'creatorName': creator.get('name'),
            'creatorType': creator.get('type'),
            'playing': game.get('playing', 0),
            'favoritedCount': game.get('favoritedCount', 0),
            'alreadyAdded': universe_id in tracked,
            'description': game.get('description', '')
        })

    def handle_api_add_group(self):
        body = self.read_json_body()
        group_id = body.get('id')
        try:
            group_id = int(group_id)
        except (TypeError, ValueError):
            self.send_error(400, 'Invalid group ID')
            return

        groups = self.load_json(GROUPS_CONFIG)
        ids = groups.get('groupIds', [])
        if group_id in ids:
            return self.send_json({'status': 'alreadyAdded', 'groupIds': ids})

        ids.append(group_id)
        groups['groupIds'] = ids
        self.write_json(GROUPS_CONFIG, groups)
        self.send_json({'status': 'added', 'groupIds': ids})

    def handle_api_add_game(self):
        body = self.read_json_body()
        universe_id = body.get('universeId')
        try:
            universe_id = int(universe_id)
        except (TypeError, ValueError):
            self.send_error(400, 'Invalid universe ID')
            return

        games = self.load_json(GAMES_CONFIG)
        ids = games.get('universeIds', [])
        if universe_id in ids:
            return self.send_json({'status': 'alreadyAdded', 'universeIds': ids})

        ids.append(universe_id)
        games['universeIds'] = ids
        self.write_json(GAMES_CONFIG, games)
        self.send_json({'status': 'added', 'universeIds': ids})

    def roblox_get_json(self, url):
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception:
            return None


def find_port(start_port=8003, max_tries=20):
    port = start_port
    for _ in range(max_tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(('0.0.0.0', port))
                return port
            except OSError:
                port += 1
    raise RuntimeError('No available port found')


def main():
    port = find_port(8003)
    server = ThreadingHTTPServer(('0.0.0.0', 8003), SiteHandler) # changed to just be static to avoid issues on the site. if i ever need it back just replace to be "port" again
    print(f'Serving site and API on http://localhost:{port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping server')
        server.server_close()


if __name__ == '__main__':
    main()
