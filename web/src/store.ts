import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Account, Tx } from '../../shared/types';

// Local records carry a `dirty` flag: 1 = changed since last sync, needs pushing.
export type LocalAccount = Account & { dirty: 0 | 1 };
export type LocalTx = Tx & { dirty: 0 | 1 };

interface KassaDB extends DBSchema {
  accounts: { key: string; value: LocalAccount };
  txs: { key: string; value: LocalTx; indexes: { byAccount: string } };
  kv: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<KassaDB>> | null = null;

function getDB(): Promise<IDBPDatabase<KassaDB>> {
  if (!dbp) {
    dbp = openDB<KassaDB>('kassa', 1, {
      upgrade(db) {
        db.createObjectStore('accounts', { keyPath: 'id' });
        const txs = db.createObjectStore('txs', { keyPath: 'id' });
        txs.createIndex('byAccount', 'accountId');
        db.createObjectStore('kv');
      },
    });
  }
  return dbp;
}

export function uuid(): string {
  // crypto.randomUUID() only exists in a secure context (HTTPS/localhost).
  // Over plain HTTP it is undefined, so fall back to a v4 UUID built from
  // getRandomValues (which IS available in insecure contexts).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

// --- key/value (lastSeq, activeId, notify pref) ---
export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await getDB()).get('kv', key) as Promise<T | undefined>;
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await getDB()).put('kv', value, key);
}

// --- accounts ---
export async function allAccounts(): Promise<LocalAccount[]> {
  const accounts = await (await getDB()).getAll('accounts');
  return accounts.filter((a) => !a.deleted).sort((a, b) => a.createdAt - b.createdAt);
}
export async function getAccount(id: string): Promise<LocalAccount | undefined> {
  return (await getDB()).get('accounts', id);
}
export async function putAccountLocal(account: LocalAccount): Promise<void> {
  await (await getDB()).put('accounts', account);
}

// --- transactions ---
export async function txsForAccount(accountId: string): Promise<LocalTx[]> {
  const all = await (await getDB()).getAllFromIndex('txs', 'byAccount', accountId);
  return all.filter((t) => !t.deleted).sort((a, b) => b.ts - a.ts); // newest first
}
export async function getTx(id: string): Promise<LocalTx | undefined> {
  return (await getDB()).get('txs', id);
}
export async function putTxLocal(t: LocalTx): Promise<void> {
  await (await getDB()).put('txs', t);
}

// Current balance of an account, in öre (sum of all live transactions).
export async function balanceOf(accountId: string): Promise<number> {
  const txs = await txsForAccount(accountId);
  return txs.reduce((sum, t) => sum + t.amountOre, 0);
}

// Build a human-readable export of all live data (accounts with their txs,
// oldest first). Internal sync fields are dropped.
export async function exportAll(): Promise<unknown[]> {
  const accounts = await allAccounts();
  const out = [];
  for (const a of accounts) {
    const txs = (await txsForAccount(a.id))
      .slice()
      .sort((x, y) => x.ts - y.ts)
      .map((t) => ({
        id: t.id,
        ts: t.ts,
        time: new Date(t.ts).toISOString(),
        amountOre: t.amountOre,
        note: t.note,
        author: t.author,
        kind: t.kind,
      }));
    const balanceOre = txs.reduce((s, t) => s + t.amountOre, 0);
    out.push({
      id: a.id,
      name: a.name,
      color: a.color,
      allowanceOre: a.allowanceOre,
      allowanceWeekday: a.allowanceWeekday,
      balanceOre,
      txs,
    });
  }
  return out;
}

// --- sync helpers ---
export async function dirtyAccounts(): Promise<LocalAccount[]> {
  return (await (await getDB()).getAll('accounts')).filter((a) => a.dirty);
}
export async function dirtyTxs(): Promise<LocalTx[]> {
  return (await (await getDB()).getAll('txs')).filter((t) => t.dirty);
}
