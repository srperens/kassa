# Kassa

A local-first ledger. Track a running **balance** — add money, subtract money,
and optionally let a recurring amount accrue on its own (e.g. a weekly
allowance). Works offline as a PWA and syncs to a small Node + SQLite server, so
several people can use it on their own phones and always see the same balance.

## How it works

Kassa is a **ledger**, not a stored number. Every add/subtract is its own record
with a unique id; the balance is the sum of all records. Because each edit is a
separate record, two people editing offline at the same time never overwrite each
other — both records sync and the balance stays correct.

The weekly allowance works the same way: each occurrence has a deterministic id,
so any device can create it offline and the duplicates collapse to one on sync.
No server cron — the app catches up on every launch.

## Features

- Big balance with two buttons: Add / Subtract
- Notes on any transaction
- Optional recurring entries (e.g. a weekly allowance), added automatically and offline-safe
- Multiple accounts, switchable via tabs
- Offline-first (IndexedDB + service worker), syncs when the network returns
- English and Swedish

## Development

```bash
npm install
npm run gen-icons   # generate PNG icons (run once)
npm run dev         # Vite on :5173 + API on :3000
```

Open http://localhost:5173 and log in. The dev key is `dev-token` unless you set
`KASSA_TOKENS`.

## Build & run

```bash
npm run build
KASSA_TOKENS=alice:secret1,bob:secret2 PORT=3000 npm start
```

The server serves the built PWA and the `/api/*` endpoints from the same port.

### Environment variables

| Variable       | Default             | Description                       |
| -------------- | ------------------- | --------------------------------- |
| `PORT`         | `3000`              | Port the server listens on        |
| `HOST`         | `0.0.0.0`           | Bind address                      |
| `KASSA_TOKENS` | `dev:dev-token`     | API keys: `name:token,name:token` |
| `KASSA_DB`     | `dist/kassa.sqlite` | Path to the SQLite file           |

Authentication: the app shell is public, all data requires a valid API key. Keys
live only in `KASSA_TOKENS` and can be revoked by removing them.

## Docker

```bash
docker compose up -d --build
```

The SQLite database is stored in the `kassa-data` volume so it survives rebuilds.
Set `KASSA_TOKENS` in a `.env` file first.

## License

MIT — see [LICENSE](LICENSE).
