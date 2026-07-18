import type { Tx } from '../../shared/types';
import { allAccounts, getTx, putTxLocal, type LocalAccount } from './store';

// Weekly allowance ("veckopeng") without a server cron.
//
// The trick that makes this work offline AND across two phones: each occurrence
// gets a DETERMINISTIC id, `sched:<accountId>:<YYYY-MM-DD>`. Both Per's and Lena's
// devices independently compute the same occurrences and create the same ids, so
// when they sync the duplicates collapse to one record (same primary key) — never
// two. It's purely additive to the ledger, so the balance stays correct.
//
// We "catch up" on every launch / focus: for each active schedule, walk every
// occurrence of the chosen weekday from the schedule's start up to today and make
// sure a transaction exists for it. Existence is checked INCLUDING soft-deleted
// rows, so a deleted allowance is never silently resurrected.

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// All occurrence dates (at 09:00 local) of `weekday` from `start`..`now` inclusive.
function occurrences(startTs: number, weekday: number, now: number): Date[] {
  const out: Date[] = [];
  const start = new Date(startTs);
  // First occurrence on/after the start date.
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 9, 0, 0, 0);
  const delta = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  const end = new Date(now);
  let guard = 0;
  while (d.getTime() <= end.getTime() && guard++ < 600) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

// Returns the transactions newly created this run (so the UI can notify).
export async function catchUpSchedules(now = Date.now()): Promise<Tx[]> {
  const accounts = await allAccounts();
  const created: Tx[] = [];
  for (const acc of accounts) {
    if (acc.allowanceOre <= 0) continue;
    for (const date of occurrences(acc.allowanceStart, acc.allowanceWeekday, now)) {
      const id = `sched:${acc.id}:${localDateKey(date)}`;
      const existing = await getTx(id); // includes soft-deleted — don't resurrect
      if (existing) continue;
      const t: Tx & { dirty: 0 | 1 } = {
        id,
        accountId: acc.id,
        ts: date.getTime(),
        amountOre: acc.allowanceOre,
        note: 'Veckopeng',
        author: '',
        kind: 'scheduled',
        // Deterministic timestamps tied to the occurrence date, NOT `now`. A
        // scheduled row represents the same logical event on every device, and a
        // human deletion always happens AFTER the occurrence date — so a delete's
        // `updatedAt` always beats this one under LWW and can never be resurrected
        // by another device that re-materializes the occurrence before syncing.
        createdAt: date.getTime(),
        updatedAt: date.getTime(),
        deleted: 0,
        seq: 0,
        dirty: 1,
      };
      await putTxLocal(t);
      created.push(t);
    }
  }
  return created;
}

// The next upcoming allowance date for an account, or null if no schedule.
export function nextAllowance(acc: LocalAccount, now = Date.now()): Date | null {
  if (acc.allowanceOre <= 0) return null;
  const d = new Date(now);
  d.setHours(9, 0, 0, 0);
  const delta = (acc.allowanceWeekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (delta === 0 && d.getTime() <= now ? 7 : delta));
  return d;
}
