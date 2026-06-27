import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Account, Tx } from '../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.KASSA_DB ?? join(__dirname, '..', 'kassa.sqlite');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    color            TEXT NOT NULL DEFAULT '',
    allowanceOre     INTEGER NOT NULL DEFAULT 0,
    allowanceWeekday INTEGER NOT NULL DEFAULT 0,
    allowanceStart   INTEGER NOT NULL DEFAULT 0,
    createdAt        INTEGER NOT NULL,
    updatedAt        INTEGER NOT NULL,
    deleted          INTEGER NOT NULL DEFAULT 0,
    seq              INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS txs (
    id        TEXT PRIMARY KEY,
    accountId TEXT NOT NULL,
    ts        INTEGER NOT NULL,
    amountOre INTEGER NOT NULL DEFAULT 0,
    note      TEXT NOT NULL DEFAULT '',
    author    TEXT NOT NULL DEFAULT '',
    kind      TEXT NOT NULL DEFAULT 'manual',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deleted   INTEGER NOT NULL DEFAULT 0,
    seq       INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_accounts_seq ON accounts(seq);
  CREATE INDEX IF NOT EXISTS idx_txs_seq      ON txs(seq);
  INSERT OR IGNORE INTO meta (key, value) VALUES ('seq', 0);
`);

// Monotonic, global sequence number. Every write gets a fresh seq so clients
// can pull "everything newer than X" without trusting clocks.
function nextSeq(): number {
  const row = db
    .prepare(`UPDATE meta SET value = value + 1 WHERE key = 'seq' RETURNING value`)
    .get() as { value: number };
  return row.value;
}

// --- row <-> object ---
function rowToAccount(r: Account): Account {
  return { ...r, deleted: r.deleted ? 1 : 0 };
}
function rowToTx(r: Tx): Tx {
  return { ...r, deleted: r.deleted ? 1 : 0 };
}

const selAccount = db.prepare(`SELECT * FROM accounts WHERE id = ?`);
const selTx = db.prepare(`SELECT * FROM txs WHERE id = ?`);

const upAccount = db.prepare(`
  INSERT INTO accounts (id, name, color, allowanceOre, allowanceWeekday, allowanceStart, createdAt, updatedAt, deleted, seq)
  VALUES (@id, @name, @color, @allowanceOre, @allowanceWeekday, @allowanceStart, @createdAt, @updatedAt, @deleted, @seq)
  ON CONFLICT(id) DO UPDATE SET
    name=@name, color=@color, allowanceOre=@allowanceOre, allowanceWeekday=@allowanceWeekday,
    allowanceStart=@allowanceStart, createdAt=@createdAt, updatedAt=@updatedAt, deleted=@deleted, seq=@seq
`);

const upTx = db.prepare(`
  INSERT INTO txs (id, accountId, ts, amountOre, note, author, kind, createdAt, updatedAt, deleted, seq)
  VALUES (@id, @accountId, @ts, @amountOre, @note, @author, @kind, @createdAt, @updatedAt, @deleted, @seq)
  ON CONFLICT(id) DO UPDATE SET
    accountId=@accountId, ts=@ts, amountOre=@amountOre, note=@note, author=@author, kind=@kind,
    createdAt=@createdAt, updatedAt=@updatedAt, deleted=@deleted, seq=@seq
`);

// Last-write-wins: only apply if the incoming record is newer than ours.
export function applyAccount(incoming: Account): void {
  const existing = selAccount.get(incoming.id) as Account | undefined;
  if (existing && existing.updatedAt > incoming.updatedAt) return;
  upAccount.run({ ...incoming, deleted: incoming.deleted ? 1 : 0, seq: nextSeq() });
}

export function applyTx(incoming: Tx): void {
  const existing = selTx.get(incoming.id) as Tx | undefined;
  if (existing && existing.updatedAt > incoming.updatedAt) return;
  upTx.run({ ...incoming, deleted: incoming.deleted ? 1 : 0, seq: nextSeq() });
}

export function changesSince(since: number): { accounts: Account[]; txs: Tx[] } {
  const accounts = (db.prepare(`SELECT * FROM accounts WHERE seq > ? ORDER BY seq`).all(since) as Account[]).map(rowToAccount);
  const txs = (db.prepare(`SELECT * FROM txs WHERE seq > ? ORDER BY seq`).all(since) as Tx[]).map(rowToTx);
  return { accounts, txs };
}

export function currentSeq(): number {
  return (db.prepare(`SELECT value FROM meta WHERE key = 'seq'`).get() as { value: number }).value;
}

export const tx = db.transaction.bind(db);
