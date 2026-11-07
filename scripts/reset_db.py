#!/usr/bin/env python3
"""Reset or back up the STEM Data Wall database.

Modes (pick one):
  --events   Delete all documents in the events collection but KEEP the
             collection, its $jsonSchema validator, and its indexes.
  --board    Reset only the game board state (used tiles) via the running app.
             Does NOT touch stored events.
  --all      Drop the whole database, then recreate the events collection with
             its validator + indexes so the app works immediately afterward.

Modifiers:
  --dry-run        Show document counts per collection; change nothing.
  --backup PATH    Export events to a timestamped JSON file first (no personal
                   data). PATH may be a directory or a file.
  --yes            Skip the typed "RESET" confirmation (for automation).
  --no-notify      Do not tell the running app to clear screens afterward.

Examples:
  python3 scripts/reset_db.py --events
  python3 scripts/reset_db.py --all --backup ./backups --yes
  python3 scripts/reset_db.py --backup ./backups --dry-run      # pure backup
"""
import argparse
import datetime
import sys
from pathlib import Path

import _common as c


def counts(db):
    return {name: db[name].count_documents({}) for name in db.list_collection_names()}


def backup_events(db, path):
    from bson.json_util import dumps

    docs = list(db.events.find({}))
    p = Path(path)
    # If PATH looks like a directory, write a timestamped file inside it.
    if path.endswith("/") or p.is_dir() or p.suffix == "":
        p.mkdir(parents=True, exist_ok=True)
        ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        p = p / f"events-{ts}.json"
    else:
        p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(dumps(docs, indent=2))
    print(f"  backed up {len(docs)} events -> {p}")
    return p


def confirm(skip):
    if skip:
        return True
    try:
        return input('Type RESET to continue: ').strip() == "RESET"
    except (EOFError, KeyboardInterrupt):
        return False


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Reset or back up the STEM Data Wall database.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--events", action="store_true", help="delete all events (keep schema/indexes)")
    mode.add_argument("--board", action="store_true", help="reset only the game board via the app")
    mode.add_argument("--all", dest="all_", action="store_true", help="drop DB, recreate collection+schema+indexes")
    ap.add_argument("--dry-run", action="store_true", help="show counts, change nothing")
    ap.add_argument("--backup", metavar="PATH", help="export events to JSON before deleting")
    ap.add_argument("--yes", action="store_true", help="skip the typed confirmation")
    ap.add_argument("--no-notify", action="store_true", help="do not notify the running app")
    args = ap.parse_args(argv)

    cfg = c.load_env()

    # --board is a pure app call; no database work.
    if args.board:
        print("Resetting game board (used tiles)…")
        c.app_reset_board(cfg)
        print("Done.")
        return 0

    client, db = c.get_client_db(cfg)

    before = counts(db)
    print(f"Counts before: {before}")

    if args.backup:
        backup_events(db, args.backup)

    if args.dry_run:
        if args.events:
            print(f"DRY RUN: would delete {before.get('events', 0)} events (keep schema/indexes).")
        elif args.all_:
            print(f"DRY RUN: would DROP database '{cfg['db']}' and recreate it empty.")
        else:
            print("DRY RUN: no reset mode given — nothing would be deleted.")
        print("Nothing was changed.")
        return 0

    if not (args.events or args.all_):
        if args.backup:
            print("Backup only (no reset mode given). Done.")
            return 0
        ap.error("choose a mode: --events, --board, or --all (or use --backup/--dry-run)")

    # Destructive from here — confirm.
    what = "ALL events" if args.events else f"the entire '{cfg['db']}' database"
    print(f"About to delete {what}.")
    if not confirm(args.yes):
        print("Cancelled. Nothing was changed.")
        return 1

    if args.events:
        res = db.events.delete_many({})
        print(f"  deleted {res.deleted_count} events (collection/schema/indexes kept)")
    elif args.all_:
        client.drop_database(cfg["db"])
        print(f"  dropped database '{cfg['db']}'")
        c.create_events_collection(db)
        print("  recreated events collection + schema + indexes")

    after = counts(db)
    print(f"Counts after: {after}")

    if not args.no_notify:
        c.notify_app_reset(cfg)

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
