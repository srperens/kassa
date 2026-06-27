// Shared types between frontend and backend.
// Every record has a server-assigned `seq` (0 locally until synced) and uses
// last-write-wins via `updatedAt`. Deletion is soft (deleted=1) so it can sync.
//
// Money is stored as an integer number of öre (1 kr = 100 öre) to avoid floating
// point rounding. Positive amount = money in, negative = money out. The current
// balance of an account is just the sum of its (non-deleted) transactions.

export interface Account {
  id: string;
  name: string;
  color: string;

  // Weekly allowance ("veckopeng"). 0 amount = no schedule.
  allowanceOre: number; // amount added each period, in öre
  allowanceWeekday: number; // 0-6, JS getDay() (0 = Sunday)
  allowanceStart: number; // ts; periods before this date are never materialized

  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
  seq: number;
}

export type TxKind = 'manual' | 'scheduled';

export interface Tx {
  id: string; // manual: random uuid; scheduled: deterministic `sched:<accountId>:<YYYY-MM-DD>`
  accountId: string;
  ts: number; // when it happened (editable)
  amountOre: number; // + = money in, - = money out
  note: string;
  author: string; // who created it (logged-in user name); '' for scheduled
  kind: TxKind;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
  seq: number;
}

// What the client pushes up: records made dirty since the last sync.
export interface SyncRequest {
  since: number; // highest seq the client has already seen
  accounts: Account[];
  txs: Tx[];
}

// What the server responds with: everything changed since `since` (after the push applied).
export interface SyncResponse {
  seq: number; // new high-water mark
  accounts: Account[];
  txs: Tx[];
}
