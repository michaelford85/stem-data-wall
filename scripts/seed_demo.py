#!/usr/bin/env python3
"""Insert realistic fake events so the charts can be demoed and tested.

Every document respects the SAME $jsonSchema as the real app (no personal data,
no extra fields), so `reset_db.py --events` clears it exactly like real data.

Examples:
  python3 scripts/seed_demo.py                 # ~150 events over the last 60 min
  python3 scripts/seed_demo.py --count 400 --minutes 180
  python3 scripts/seed_demo.py --stations table-1 table-2
"""
import argparse
import datetime
import random
import sys
from pathlib import Path

import _common as c

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_questions():
    import yaml

    data = yaml.safe_load((REPO_ROOT / "content" / "questions.yaml").read_text())
    questions = []
    for cat in data["categories"]:
        for q in data["questions"].get(cat["key"], []):
            questions.append(
                {
                    "category": cat["key"],
                    "questionId": q["id"],
                    "answerIds": [a["id"] for a in q["answers"]],
                    "correct": q["correct"],
                }
            )
    topics = [t["id"] for t in data["mystery"]["topics"]]
    return questions, topics


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--count", type=int, default=150, help="number of 'plays' to generate (default 150)")
    ap.add_argument("--minutes", type=int, default=60, help="spread events over the last N minutes (default 60)")
    ap.add_argument("--correct-rate", type=float, default=0.7, help="fraction answered correctly (default 0.7)")
    ap.add_argument("--mystery-rate", type=float, default=0.12, help="fraction that are mystery topics (default 0.12)")
    ap.add_argument("--stations", nargs="+", default=None, help="station labels to spread across (default: STATION from .env)")
    ap.add_argument("--no-notify", action="store_true", help="do not notify the running app")
    args = ap.parse_args(argv)

    cfg = c.load_env()
    questions, topics = load_questions()
    stations = args.stations or [cfg["station"]]

    _client, db = c.get_client_db(cfg)

    now = datetime.datetime.utcnow()
    docs = []
    for _ in range(args.count):
        # random time within the window
        offset = random.uniform(0, args.minutes * 60)
        ts = now - datetime.timedelta(seconds=offset)
        station = random.choice(stations)

        if random.random() < args.mystery_rate:
            docs.append(
                {
                    "type": "mystery_topic",
                    "category": "mystery",
                    "questionId": None,
                    "answerId": random.choice(topics),
                    "correct": None,
                    "station": station,
                    "ts": ts,
                }
            )
            continue

        q = random.choice(questions)
        # A play is a tile pick a moment before the answer.
        docs.append(
            {
                "type": "tile_pick",
                "category": q["category"],
                "questionId": q["questionId"],
                "answerId": None,
                "correct": None,
                "station": station,
                "ts": ts - datetime.timedelta(seconds=3),
            }
        )
        if random.random() < args.correct_rate:
            answer = q["correct"]
            correct = True
        else:
            wrong = [a for a in q["answerIds"] if a != q["correct"]]
            answer = random.choice(wrong)
            correct = False
        docs.append(
            {
                "type": "answer",
                "category": q["category"],
                "questionId": q["questionId"],
                "answerId": answer,
                "correct": correct,
                "station": station,
                "ts": ts,
            }
        )

    # Make sure the collection + validator exist (in case the DB is brand new).
    c.create_events_collection(db)
    res = db.events.insert_many(docs)
    print(f"Inserted {len(res.inserted_ids)} demo events across stations {stations}.")
    print(f"Total events now: {db.events.count_documents({})}")

    if not args.no_notify:
        c.notify_app_refresh(cfg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
