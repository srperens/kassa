import type { Account, Tx, SyncRequest, SyncResponse } from '../../shared/types';
import {
  dirtyAccounts,
  dirtyTxs,
  getAccount,
  getTx,
  kvGet,
  kvSet,
  putAccountLocal,
  putTxLocal,
} from './store';
import { getToken, logout } from './auth';

let syncing = false;

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'offline';
type Listener = (status: SyncStatus) => void;
const listeners = new Set<Listener>();

export function onSyncStatus(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(status: SyncStatus): void {
  for (const fn of listeners) fn(status);
}

// Callback fired when sync pulled in NEW transactions made by someone else, so
// the UI can show a local notification ("Lena: utlägg −30 kr").
type IncomingListener = (txs: Tx[]) => void;
const incomingListeners = new Set<IncomingListener>();
export function onIncomingTxs(fn: IncomingListener): () => void {
  incomingListeners.add(fn);
  return () => incomingListeners.delete(fn);
}

// One full sync round: push everything dirty, pull everything newer, apply LWW locally.
export async function sync(): Promise<void> {
  if (syncing) return;
  if (!navigator.onLine) {
    emit('offline');
    return;
  }
  const token = getToken();
  if (!token) {
    emit('error');
    return;
  }

  syncing = true;
  emit('syncing');
  try {
    const since = (await kvGet<number>('lastSeq')) ?? 0;
    const localAccounts = await dirtyAccounts();
    const localTxs = await dirtyTxs();

    const body: SyncRequest = {
      since,
      accounts: localAccounts.map(strip),
      txs: localTxs.map(strip),
    };

    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      // Key was revoked or invalid — drop it so the app shows the login screen.
      logout();
      emit('error');
      return;
    }
    if (!res.ok) throw new Error(`sync ${res.status}`);
    const data = (await res.json()) as SyncResponse;

    // Clear dirty on what we just pushed (unless it changed in the meantime).
    for (const a of localAccounts) {
      const cur = await getAccount(a.id);
      if (cur && cur.updatedAt === a.updatedAt) await putAccountLocal({ ...cur, dirty: 0 });
    }
    for (const t of localTxs) {
      const cur = await getTx(t.id);
      if (cur && cur.updatedAt === t.updatedAt) await putTxLocal({ ...cur, dirty: 0 });
    }

    // Apply the server's changes (LWW): only write if the server's is newer.
    for (const a of data.accounts) {
      const cur = await getAccount(a.id);
      if (!cur || a.updatedAt >= cur.updatedAt) await putAccountLocal({ ...a, dirty: 0 });
    }
    const freshIncoming: Tx[] = [];
    for (const t of data.txs) {
      const cur = await getTx(t.id);
      if (!cur && !t.deleted) freshIncoming.push(t); // brand new to this device
      if (!cur || t.updatedAt >= cur.updatedAt) await putTxLocal({ ...t, dirty: 0 });
    }

    await kvSet('lastSeq', data.seq);
    emit('ok');
    if (freshIncoming.length) {
      for (const fn of incomingListeners) fn(freshIncoming);
    }
  } catch (err) {
    console.warn('sync failed', err);
    emit('error');
  } finally {
    syncing = false;
  }
}

function strip<T extends Account | Tx>(r: T & { dirty?: 0 | 1 }): T {
  const { dirty, ...rest } = r;
  return rest as T;
}

// Sync when we regain the network, when the tab becomes active, and periodically.
export function startAutoSync(): void {
  window.addEventListener('online', () => void sync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sync();
  });
  setInterval(() => void sync(), 30_000);
  void sync();
}
