"""Shared helpers for the reset/seed scripts.

Reads configuration from the repo's .env, connects to MongoDB with clear error
messages, and knows how to (re)create the events collection with the SAME
$jsonSchema validator and indexes the app uses (db/events.schema.json and
db/indexes.json — one source of truth).
"""
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def die(msg, code=1):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def load_env():
    """Load .env from the repo root and return the settings the scripts need.

    Scripts run on the Pi/laptop (outside Docker), so they prefer MONGO_URI_HOST
    (127.0.0.1) over MONGO_URI (the in-container 'mongo' host name).
    """
    env_path = REPO_ROOT / ".env"
    try:
        from dotenv import load_dotenv

        load_dotenv(env_path)
    except ImportError:
        # Fall back to a tiny parser so the scripts still work without python-dotenv.
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())

    uri = os.environ.get("MONGO_URI_HOST") or os.environ.get("MONGO_URI")
    if not uri:
        die(
            "No MONGO_URI_HOST or MONGO_URI found.\n"
            "  Copy .env.example to .env and fill it in (see the README)."
        )
    return {
        "uri": uri,
        "db": os.environ.get("MONGO_DB", "datawall"),
        "pin": os.environ.get("ADMIN_PIN"),
        "app_url": os.environ.get("APP_URL", "http://127.0.0.1:8080"),
        "station": os.environ.get("STATION", "table-1"),
    }


def get_client_db(cfg):
    """Connect to MongoDB or exit with a friendly message."""
    try:
        from pymongo import MongoClient
    except ImportError:
        die(
            "pymongo is not installed.\n"
            "  pip:  pip install -r scripts/requirements.txt\n"
            "  uv :  (from the scripts/ folder) uv run reset_db.py --help"
        )
    try:
        client = MongoClient(cfg["uri"], serverSelectionTimeoutMS=4000)
        client.admin.command("ping")
    except Exception as e:  # noqa: BLE001 - we want a friendly catch-all here
        die(
            "Could not connect to MongoDB.\n"
            f"  {e}\n"
            "  Is the stack running (make up / docker compose up)?\n"
            "  On the Pi/laptop, MongoDB is bound to 127.0.0.1:27017 on purpose."
        )
    return client, client[cfg["db"]]


def load_validator():
    data = json.loads((REPO_ROOT / "db" / "events.schema.json").read_text())
    return {"$jsonSchema": data["$jsonSchema"]}


def load_indexes():
    return json.loads((REPO_ROOT / "db" / "indexes.json").read_text())


def create_events_collection(db):
    """(Re)create the events collection with the validator + indexes.

    Mirrors server/db.js so the app works immediately after a --all reset.
    """
    validator = load_validator()
    if "events" not in db.list_collection_names():
        db.create_collection(
            "events", validator=validator, validationLevel="strict", validationAction="error"
        )
    else:
        db.command(
            {
                "collMod": "events",
                "validator": validator,
                "validationLevel": "strict",
                "validationAction": "error",
            }
        )
    for idx in load_indexes():
        key = [(k, v) for k, v in idx["key"].items()]
        db.events.create_index(key, name=idx["name"])


def _post_json(url, pin, timeout=4):
    import urllib.request

    req = urllib.request.Request(
        url,
        data=b"{}",
        headers={"Content-Type": "application/json", "x-admin-pin": pin or ""},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status


def notify_app_reset(cfg):
    """Tell the running app to clear the board + charts live (POST reset-notify)."""
    if not cfg.get("pin"):
        print("  (no ADMIN_PIN set — skipping live app notify)")
        return
    url = cfg["app_url"].rstrip("/") + "/api/admin/reset-notify"
    try:
        status = _post_json(url, cfg["pin"])
        print(f"  notified app → monitor/results/iPad cleared live (HTTP {status})")
    except Exception as e:  # noqa: BLE001
        print(f"  (could not notify app at {url}: {e}")
        print("   — not fatal; Grafana and charts clear on their next refresh)")


def notify_app_refresh(cfg):
    """Ask the running app to re-broadcast stats so charts update live after a
    direct DB insert (e.g. seeding). Does not reset the board."""
    if not cfg.get("pin"):
        print("  (no ADMIN_PIN set — skipping live app refresh)")
        return
    url = cfg["app_url"].rstrip("/") + "/api/admin/refresh"
    try:
        status = _post_json(url, cfg["pin"])
        print(f"  refreshed app charts live (HTTP {status})")
    except Exception as e:  # noqa: BLE001
        print(f"  (could not refresh app at {url}: {e} — charts update on next event/refresh)")


def app_reset_board(cfg):
    """Reset only the in-memory game board (used tiles) via the app endpoint."""
    url = cfg["app_url"].rstrip("/") + "/api/admin/reset-board"
    try:
        status = _post_json(url, cfg["pin"])
        print(f"  board reset via app (HTTP {status})")
    except Exception as e:  # noqa: BLE001
        die(
            f"Could not reach the app at {url} to reset the board.\n  {e}\n"
            "  The board lives in the running app's memory, so the app must be up."
        )
