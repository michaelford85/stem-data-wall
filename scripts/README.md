# Reset & seed scripts

Small Python 3.10+ utilities for managing the (anonymous) events database.
They read `MONGO_URI_HOST` (falling back to `MONGO_URI`), `MONGO_DB`,
`ADMIN_PIN`, and `APP_URL` from the repo's `.env`.

## Install

```bash
# Option A: pip
python3 -m pip install -r scripts/requirements.txt

# Option B: uv (no manual venv)
cd scripts && uv run reset_db.py --help
```

## reset_db.py

| Command | What it does |
| --- | --- |
| `reset_db.py --events` | Delete all events; keep collection, schema, indexes |
| `reset_db.py --board` | Reset only the game board (used tiles) via the app |
| `reset_db.py --all` | Drop the DB, recreate collection + schema + indexes |
| `reset_db.py --dry-run` | Show counts; change nothing |
| `reset_db.py --backup PATH` | Export events to timestamped JSON first |
| `reset_db.py --yes` | Skip the typed `RESET` confirmation (automation) |

After a successful `--events` / `--all`, the script calls the app's
PIN-protected `/api/admin/reset-notify` endpoint so the monitor, results page,
and iPad clear **live** (no page reload). Grafana clears on its next refresh.

```bash
python3 scripts/reset_db.py --events                       # most common
python3 scripts/reset_db.py --all --backup ./backups --yes # nuke + rebuild, backed up
python3 scripts/reset_db.py --backup ./backups --dry-run   # pure backup, no delete
```

## seed_demo.py

Insert realistic fake events (respecting the same schema) so you can demo the
charts before the event.

```bash
python3 scripts/seed_demo.py                      # ~150 plays over the last hour
python3 scripts/seed_demo.py --count 400 --minutes 180
python3 scripts/seed_demo.py --stations table-1 table-2
```

Clear it afterward with `reset_db.py --events`.

## Running from a laptop (not on the Pi)

MongoDB is bound to `127.0.0.1` on the Pi, so from another machine either:

- **SSH tunnel:** `ssh -L 27017:127.0.0.1:27017 -L 8080:127.0.0.1:8080 pi@<your-pi-hostname>.local`
  then run the scripts locally (they'll reach the tunneled ports), or
- **Ansible:** `ansible-playbook -i ansible/inventory.example.ini ansible/reset-data.yml -e mode=events`
  (runs the script on the Pi for you — see the main README).
