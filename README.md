# Kassa

A local-first checkbook. Track a running **balance** — add money, subtract money,
and let a weekly **allowance** ("veckopeng") accrue on its own. Built for a family:
both parents log in on their own phones and always see the same balance. Offline-first
PWA that syncs to a small Node + SQLite server.

## How it works (and why the balance is always right)

Kassa is a **ledger**, not a stored number. Every add/subtract is its own record
(`Tx`) with a unique id; the balance is *computed* as the sum of all records. The
server stores the ledger — never a balance field.

This is what makes concurrent edits safe: if Per spends 30 kr offline and Lena
spends 50 kr offline at the same time, they create two different records. When both
sync, both land on the server (different ids, no conflict) and the balance becomes
the sum of everything — nothing is lost. A naive "store the balance and overwrite
it" design would silently drop one of the two. Last-write-wins only applies when the
*same* record is edited on two devices — rare, and harmless.

The weekly allowance uses the same trick. Each occurrence has a **deterministic id**
(`sched:<accountId>:<YYYY-MM-DD>`), so both phones can materialise "Sunday's 50 kr"
independently while offline and the duplicates collapse to one record on sync. No
server cron needed — the app catches up on every launch.

## Features

- **One number that matters** – a big balance, two buttons: Add / Subtract.
- **Notes** – attach free text to any transaction ("ice cream", "gift").
- **Weekly allowance** – e.g. 50 kr every Sunday, added automatically and offline-safe.
- **Multiple accounts** – one per child, switch via tabs.
- **Author attribution** – each transaction shows who made it.
- **Offline** – IndexedDB locally + a service worker. Works with no network, syncs when it returns.
- **Notifications** – local notifications for incoming allowance / the other person's spending (while the app is running).
- **Languages** – English and Swedish, switchable in settings.
- **Login** – each person logs in once with their own API key, stored on the device.

## Security

The service is meant to face the open internet. The **app shell is public** (it holds
no secrets); **all data requires a valid API key**. Keys are named and live only in the
server's environment (`KASSA_TOKENS`), never in the repo. Each device logs in once and
keeps the key in `localStorage`. A key can be revoked individually by removing it from
`KASSA_TOKENS` — that device then drops to the login screen on its next sync.

## Development

```bash
npm install
npm run gen-icons   # generate PNG icons (run once)
npm run dev         # Vite on :5173 + API on :3000 (Vite proxies /api)
```

Open http://localhost:5173 and log in. In dev the default key is `dev-token`
(user `dev`) unless you set `KASSA_TOKENS`.

## Build & run in production

```bash
npm run build       # web -> dist/public, server -> dist/
KASSA_TOKENS=per:secret1,lena:secret2 PORT=3000 npm start
```

The server serves the built PWA and the `/api/*` endpoints from the same port.

### Environment variables

| Variable        | Default            | Description                                   |
| --------------- | ------------------ | --------------------------------------------- |
| `PORT`          | `3000`             | Port the server listens on                    |
| `HOST`          | `0.0.0.0`          | Bind address                                  |
| `KASSA_TOKENS`  | `dev:dev-token`    | Named API keys: `name:token,name:token`       |
| `KASSA_DB`      | `dist/kassa.sqlite`| Path to the SQLite file                       |

## Docker

```bash
docker compose up -d --build
```

The SQLite database is stored in the `kassa-data` volume (mounted at `/data`), so it
survives container rebuilds. Set `KASSA_TOKENS` in a `.env` file first.

## Deploy

The image is built locally and shipped to the server (no remote build needed):

```bash
./scripts/deploy.sh              # build -> save -> scp -> docker load -> compose up
KASSA_HOST=myhost ./scripts/deploy.sh
```

The server only needs `~/kassa/docker-compose.yml` and a `.env` with `KASSA_TOKENS`.

## Backup

```bash
./scripts/backup.sh              # writes backups/kassa-<timestamp>.sqlite
```

Uses better-sqlite3's online backup API inside the container (WAL-safe). For automated
backups, install `scripts/backup-cron.sh` on the server and add a cron entry:

```bash
30 3 * * * $HOME/kassa/backup-cron.sh >> $HOME/kassa-backups/backup.log 2>&1
```

## Data export

In the app: **Settings → Export JSON** downloads all accounts and transactions
(with computed balances) as `kassa-export-<date>.json`.

## API

| Endpoint       | Auth   | Purpose                                        |
| -------------- | ------ | ---------------------------------------------- |
| `POST /api/login`  | Bearer | Validate a key, return the user name       |
| `POST /api/sync`   | Bearer | Push dirty records, pull everything newer  |
| `GET /api/health`  | none   | Liveness + current seq                      |

## License

MIT — see [LICENSE](LICENSE).
