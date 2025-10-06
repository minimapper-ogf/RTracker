from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pathlib import Path
import json

# ---- CONFIG ----
DATA_DIR = Path("../data")
GAMES_NORMAL = DATA_DIR / "games" / "normal"
GAMES_DAILY = DATA_DIR / "games" / "daily"
BADGES_DIR = DATA_DIR / "badges"

app = FastAPI(title="RTracker API", version="0.3")

# Add this **CORS middleware** near the top, after creating the app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (for demo purposes)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------
# Utility functions
# ---------------------------
def load_json(path: Path):
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path.name}")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"Corrupted JSON: {path.name}")


def list_json_ids(folder: Path):
    """Return list of universe IDs based on filenames in folder."""
    if not folder.exists():
        return []
    return [f.stem for f in folder.glob("*.json")]


# ---------------------------
# Badges Endpoints
# ---------------------------
@app.get("/badges")
def get_badge_list(include_count: bool = False):
    """Lists all universe IDs that have badge data."""
    ids = list_json_ids(BADGES_DIR)
    if not include_count:
        return {"universes": ids}

    result = []
    for uid in ids:
        data = load_json(BADGES_DIR / f"{uid}.json")
        badge_count = len(data) if isinstance(data, list) else len(data.get("badges", []))
        result.append({"universeId": uid, "badgeCount": badge_count})
    return {"universes": result}


@app.get("/badges/{universe_id}")
def get_badges(universe_id: str):
    """Return badge data for a specific universe."""
    data = load_json(BADGES_DIR / f"{universe_id}.json")
    return JSONResponse(content=data)


# ---------------------------
# Games Endpoints
# ---------------------------
@app.get("/games")
def get_all_games():
    """Lists all games in /games/normal with metadata and latest stats."""
    ids = list_json_ids(GAMES_NORMAL)
    games = []
    for uid in ids:
        game_data = load_json(GAMES_NORMAL / f"{uid}.json")
        metadata = game_data.get("metadata", {})
        history = game_data.get("history", [])
        latest = history[-1] if history else {}

        games.append({
            "universeId": uid,
            "name": metadata.get("name"),
            "genre": metadata.get("genre"),
            "creator": metadata.get("creator", {}),
            "playing": latest.get("playing"),
            "visits": latest.get("visits"),
            "favoritedCount": latest.get("favoritedCount"),
            "upVotePercentage": latest.get("upVotePercentage"),
        })

    return {"games": games}


@app.get("/games/search")
def search_games(name: str = Query(..., description="Partial or full game name to search for")):
    """
    Search games in /games/normal by partial or full name.
    Case-insensitive search.
    """
    ids = list_json_ids(GAMES_NORMAL)
    results = []

    for uid in ids:
        game_data = load_json(GAMES_NORMAL / f"{uid}.json")
        metadata = game_data.get("metadata", {})
        if name.lower() in metadata.get("name", "").lower():
            history = game_data.get("history", [])
            latest = history[-1] if history else {}
            results.append({
                "universeId": uid,
                "name": metadata.get("name"),
                "genre": metadata.get("genre"),
                "creator": metadata.get("creator", {}),
                "playing": latest.get("playing"),
                "visits": latest.get("visits"),
                "favoritedCount": latest.get("favoritedCount"),
                "upVotePercentage": latest.get("upVotePercentage"),
            })

    return {"results": results}


@app.get("/games/normal/{universe_id}")
def get_game_normal(universe_id: str):
    """Return JSON data for a game from /games/normal/."""
    data = load_json(GAMES_NORMAL / f"{universe_id}.json")
    return JSONResponse(content=data)


@app.get("/games/daily/{universe_id}")
def get_game_daily(universe_id: str):
    """Return JSON data for a game from /games/daily/."""
    data = load_json(GAMES_DAILY / f"{universe_id}.json")
    return JSONResponse(content=data)


@app.get("/games/compare/{folder_type}")
def compare_games(
    folder_type: str,
    ids: str = Query(..., description="Comma-separated list of universe IDs (max 5)")
):
    """
    Compare up to 5 games from the same folder_type ('normal' or 'daily').
    Returns full JSON for each game requested.
    """
    if folder_type not in ["normal", "daily"]:
        raise HTTPException(status_code=400, detail="folder_type must be 'normal' or 'daily'")

    folder = GAMES_NORMAL if folder_type == "normal" else GAMES_DAILY
    id_list = [i.strip() for i in ids.split(",")]
    if len(id_list) > 5:
        raise HTTPException(status_code=400, detail="Cannot compare more than 5 games at once")

    results = []
    for uid in id_list:
        game_file = folder / f"{uid}.json"
        results.append(load_json(game_file))

    return {"games": results}


# ---------------------------
# Root Endpoint
# ---------------------------
@app.get("/")
def root():
    return {
        "message": "RTracker API",
        "endpoints": [
            "/badges",
            "/badges/{universe_id}",
            "/games",
            "/games/search?name=<name>",
            "/games/compare/normal?ids=<id1,id2,...>",
            "/games/normal/{universe_id}",
            "/games/daily/{universe_id}"
        ]
    }


# ---------------------------
# Run with: uvicorn api_server:app --port 8000 --reload
# ---------------------------

