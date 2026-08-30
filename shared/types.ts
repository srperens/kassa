// Shared types between frontend and backend.
// Every record has a server-assigned `seq` (0 locally until synced) and uses
// last-write-wins via `updatedAt`. Deletion is soft (deleted=1) so it can sync.
//
// Money is stored as an integer number of minor units (1 kr = 100 öre, $1 = 100
// cents) to avoid floating point rounding. Positive amount = money in, negative =
// money out. The current balance of an account is just the sum of its
// (non-deleted) transactions. `currency` is a per-account display label only —
// amounts are never converted between currencies.

export interface Account {
  id: string;
  name: string;
  color: string;
  currency: string; // ISO 4217-ish code: 'SEK' | 'USD' | 'EUR' | 'GBP'

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

// A configurable quick button ("snabbknapp") for something you register often,
// e.g. "Robux −65 kr". Tapping it books the transaction straight away.
// The sign of `amountOre` is the kind: + = money in, - = money out.
export interface Shortcut {
  id: string;
  amountOre: number; // + = money in, - = money out (never 0)
  note: string; // what shows on the button, e.g. 'Robux'
  accountIds: string[]; // which accounts it shows on; EMPTY = all accounts

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
  shortcuts?: Shortcut[]; // optional: clients predating quick buttons omit it
}

// What the server responds with: everything changed since `since` (after the push applied).
export interface SyncResponse {
  seq: number; // new high-water mark
  accounts: Account[];
  txs: Tx[];
  shortcuts: Shortcut[];
}
