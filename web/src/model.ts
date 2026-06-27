import {
  getAccount,
  getTx,
  putAccountLocal,
  putTxLocal,
  txsForAccount,
  uuid,
  type LocalAccount,
  type LocalTx,
} from './store';
import { getUser } from './auth';
import { sync } from './sync';

const COLORS = ['#34d399', '#5b9dff', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185', '#22d3ee'];

function now(): number {
  return Date.now();
}

// Trigger a background sync after every change (never awaited).
function kick(): void {
  void sync();
}

// --- accounts ---
export async function createAccount(name: string, currency = 'SEK'): Promise<LocalAccount> {
  const t = now();
  const account: LocalAccount = {
    id: uuid(),
    name: name.trim() || 'Nytt konto',
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    currency,
    allowanceOre: 0,
    allowanceWeekday: 0, // Sunday
    allowanceStart: t,
    createdAt: t,
    updatedAt: t,
    deleted: 0,
    seq: 0,
    dirty: 1,
  };
  await putAccountLocal(account);
  kick();
  return account;
}

export async function renameAccount(id: string, name: string): Promise<void> {
  const acc = await getAccount(id);
  if (!acc) return;
  await putAccountLocal({ ...acc, name: name.trim() || acc.name, updatedAt: now(), dirty: 1 });
  kick();
}

// Update the weekly allowance. Setting amountOre to 0 turns it off. When turning
// it on (or changing the start), `start` controls how far back catch-up reaches —
// default to now so we don't backfill a long history.
export async function updateAllowance(
  id: string,
  amountOre: number,
  weekday: number,
  start?: number,
): Promise<void> {
  const acc = await getAccount(id);
  if (!acc) return;
  await putAccountLocal({
    ...acc,
    allowanceOre: Math.max(0, Math.round(amountOre)),
    allowanceWeekday: weekday,
    allowanceStart: start ?? acc.allowanceStart,
    updatedAt: now(),
    dirty: 1,
  });
  kick();
}

export async function setCurrency(id: string, currency: string): Promise<void> {
  const acc = await getAccount(id);
  if (!acc) return;
  await putAccountLocal({ ...acc, currency, updatedAt: now(), dirty: 1 });
  kick();
}

export async function deleteAccount(id: string): Promise<void> {
  const acc = await getAccount(id);
  if (!acc) return;
  await putAccountLocal({ ...acc, deleted: 1, updatedAt: now(), dirty: 1 });
  // Soft-delete its transactions too so they disappear on other devices.
  for (const t of await txsForAccount(id)) {
    await putTxLocal({ ...t, deleted: 1, updatedAt: now(), dirty: 1 });
  }
  kick();
}

// --- transactions ---
// The core action. amountOre > 0 = money in, < 0 = money out. Fast, local, immediate.
export async function addTx(
  accountId: string,
  amountOre: number,
  note = '',
): Promise<LocalTx> {
  const t = now();
  const entry: LocalTx = {
    id: uuid(),
    accountId,
    ts: t,
    amountOre: Math.round(amountOre),
    note: note.trim(),
    author: getUser(),
    kind: 'manual',
    createdAt: t,
    updatedAt: t,
    deleted: 0,
    seq: 0,
    dirty: 1,
  };
  await putTxLocal(entry);
  kick();
  return entry;
}

export async function updateTx(
  id: string,
  patch: { amountOre?: number; note?: string; ts?: number },
): Promise<void> {
  const t = await getTx(id);
  if (!t) return;
  const next = { ...t, ...patch, updatedAt: now(), dirty: 1 } as LocalTx;
  if (patch.amountOre !== undefined) next.amountOre = Math.round(patch.amountOre);
  if (patch.note !== undefined) next.note = patch.note.trim();
  await putTxLocal(next);
  kick();
}

export async function deleteTx(id: string): Promise<void> {
  const t = await getTx(id);
  if (!t) return;
  await putTxLocal({ ...t, deleted: 1, updatedAt: now(), dirty: 1 });
  kick();
}
