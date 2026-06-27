import './styles.css';
import {
  allAccounts,
  balanceOf,
  exportAll,
  kvGet,
  kvSet,
  txsForAccount,
  type LocalAccount,
  type LocalTx,
} from './store';
import {
  addTx,
  createAccount,
  deleteAccount,
  deleteTx,
  renameAccount,
  updateAllowance,
  updateTx,
} from './model';
import { getUser, isLoggedIn, login, logout } from './auth';
import { onIncomingTxs, onSyncStatus, startAutoSync, sync, type SyncStatus } from './sync';
import { catchUpSchedules, nextAllowance } from './schedule';
import { notify, notifyEnabled, setNotifyPref } from './notify';
import { kr, krSigned, parseKr } from './money';
import { getLang, locale, setLang, t, weekdayName, type Lang } from './i18n';

// Register the service worker in production only (avoids stale caches in dev).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}

const root = document.getElementById('app')!;

interface State {
  accounts: LocalAccount[];
  activeId: string | null;
  txs: LocalTx[];
  balance: number;
  status: SyncStatus;
}
const state: State = { accounts: [], activeId: null, txs: [], balance: 0, status: 'idle' };

const QUICK_ORE = [1000, 2000, 5000, 10000];

// --- formatting (rebuilt per call so a language change takes effect immediately) ---
function dayFmt(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
}
function timeFmt(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' });
}
function fullFmt(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' });
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('day.today');
  if (d.toDateString() === yest.toDateString()) return t('day.yesterday');
  return dayFmt().format(d);
}

// --- DOM helpers ---
function el(html: string): HTMLElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild as HTMLElement;
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function statusLabel(s: SyncStatus): string {
  return t(`status.${s}`);
}

// --- state loading ---
async function loadAccounts(): Promise<void> {
  state.accounts = await allAccounts();
  if (!state.activeId || !state.accounts.some((a) => a.id === state.activeId)) {
    state.activeId = (await kvGet<string>('activeId')) ?? state.accounts[0]?.id ?? null;
    if (state.activeId && !state.accounts.some((a) => a.id === state.activeId)) {
      state.activeId = state.accounts[0]?.id ?? null;
    }
  }
}
async function loadTxs(): Promise<void> {
  if (state.activeId) {
    state.txs = await txsForAccount(state.activeId);
    state.balance = await balanceOf(state.activeId);
  } else {
    state.txs = [];
    state.balance = 0;
  }
}
async function refresh(): Promise<void> {
  await loadAccounts();
  await loadTxs();
  render();
}

async function setActive(id: string): Promise<void> {
  state.activeId = id;
  await kvSet('activeId', id);
  await loadTxs();
  render();
}

// --- main render ---
function render(): void {
  const active = state.accounts.find((a) => a.id === state.activeId) ?? null;
  root.innerHTML = '';

  // Header
  const header = el(`
    <header class="topbar">
      <div class="brand">${esc(t('brand'))}</div>
      <button class="status" data-act="settings" title="${esc(t('settings.title.attr'))}">
        <span class="dot ${state.status}"></span>${statusLabel(state.status)}
      </button>
    </header>
  `);
  root.appendChild(header);
  header.querySelector<HTMLButtonElement>('[data-act=settings]')!.onclick = () => openSettings();

  // Account tabs
  const tabs = el(`<nav class="tabs"></nav>`);
  for (const acc of state.accounts) {
    const tab = el(
      `<button class="tab ${acc.id === state.activeId ? 'active' : ''}">
        <span class="swatch" style="background:${acc.color}"></span>${esc(acc.name)}
      </button>`,
    );
    tab.onclick = () => void setActive(acc.id);
    tabs.appendChild(tab);
  }
  const addTab = el(`<button class="tab add" title="${esc(t('accounts.new'))}">+</button>`);
  addTab.onclick = () => void newAccountFlow();
  tabs.appendChild(addTab);
  root.appendChild(tabs);

  if (!active) {
    root.appendChild(
      el(`<div class="empty"><p>${esc(t('accounts.empty.1'))}</p><p>${t('accounts.empty.2')}</p></div>`),
    );
    return;
  }

  // Balance card
  const neg = state.balance < 0;
  const next = nextAllowance(active);
  const card = el(`
    <section class="balance-card" style="--accent:${active.color}">
      <div class="balance-name">${esc(active.name)}</div>
      <div class="balance-amount ${neg ? 'neg' : ''}">${kr(state.balance)}</div>
      ${
        next
          ? `<div class="balance-next">${esc(t('balance.next', { date: dayFmt().format(next), amount: kr(active.allowanceOre) }))}</div>`
          : `<div class="balance-next muted">${esc(t('balance.none'))}</div>`
      }
    </section>
  `);
  root.appendChild(card);

  // Action buttons
  const actions = el(`
    <div class="actions">
      <button class="act add" id="a-add">${esc(t('action.add'))}</button>
      <button class="act sub" id="a-sub">${esc(t('action.sub'))}</button>
    </div>
  `);
  actions.querySelector<HTMLButtonElement>('#a-add')!.onclick = () => openAmount(active, +1);
  actions.querySelector<HTMLButtonElement>('#a-sub')!.onclick = () => openAmount(active, -1);
  root.appendChild(actions);

  // Transaction list
  const list = el(`<div class="txs"></div>`);
  if (state.txs.length === 0) {
    list.appendChild(el(`<div class="empty small">${esc(t('txs.empty'))}</div>`));
  } else {
    let lastDay = '';
    for (const tx of state.txs) {
      const dk = dayKey(tx.ts);
      if (dk !== lastDay) {
        list.appendChild(el(`<div class="daysep">${esc(dk)}</div>`));
        lastDay = dk;
      }
      const meta =
        tx.kind === 'scheduled'
          ? `<span class="badge">${esc(t('badge.allowance'))}</span>`
          : tx.author
            ? `<span class="who">${esc(tx.author)}</span>`
            : '';
      const noteText = tx.note
        ? esc(tx.note)
        : `<span class="muted">${esc(tx.kind === 'scheduled' ? t('allowance.word') : t('dash'))}</span>`;
      const row = el(
        `<button class="tx">
          <span class="ttime">${timeFmt().format(new Date(tx.ts))}</span>
          <span class="tbody">
            <span class="tnote">${noteText}</span>
            ${meta ? `<span class="tmeta">${meta}</span>` : ''}
          </span>
          <span class="tamt ${tx.amountOre < 0 ? 'neg' : 'pos'}">${krSigned(tx.amountOre)}</span>
        </button>`,
      );
      row.onclick = () => openTx(tx);
      list.appendChild(row);
    }
  }
  root.appendChild(list);
}

// --- amount entry (add / subtract) ---
function openAmount(acc: LocalAccount, sign: 1 | -1): void {
  const isAdd = sign > 0;
  const content = el(`
    <div class="form">
      <h2>${esc(isAdd ? t('amount.add.title') : t('amount.sub.title'))}</h2>
      <label>${esc(t('amount.label'))}
        <input id="m-amt" inputmode="decimal" placeholder="0" autocomplete="off">
      </label>
      <div class="quickamts" id="m-quick"></div>
      <label>${esc(t('amount.note'))}
        <input id="m-note" placeholder="${esc(isAdd ? t('amount.note.add') : t('amount.note.sub'))}">
      </label>
      <div class="row">
        <button class="btn" id="m-cancel">${esc(t('btn.cancel'))}</button>
        <button class="btn ${isAdd ? 'go-add' : 'go-sub'}" id="m-ok">${esc(isAdd ? t('btn.add') : t('btn.sub'))}</button>
      </div>
    </div>
  `);
  const close = openModal(content);
  const amt = content.querySelector<HTMLInputElement>('#m-amt')!;
  const noteEl = content.querySelector<HTMLInputElement>('#m-note')!;
  setTimeout(() => amt.focus(), 60);

  const quick = content.querySelector<HTMLDivElement>('#m-quick')!;
  for (const ore of QUICK_ORE) {
    const chip = el(`<button type="button" class="qchip">${kr(ore)}</button>`);
    chip.onclick = () => {
      amt.value = String(ore / 100);
      amt.focus();
    };
    quick.appendChild(chip);
  }

  const submit = async () => {
    const ore = parseKr(amt.value);
    if (ore === null || ore <= 0) {
      amt.focus();
      amt.classList.add('shake');
      setTimeout(() => amt.classList.remove('shake'), 400);
      return;
    }
    if (navigator.vibrate) navigator.vibrate(15);
    await addTx(acc.id, sign * ore, noteEl.value);
    close();
    await refresh();
    flash(isAdd ? t('flash.added', { amount: kr(ore) }) : t('flash.subtracted', { amount: kr(ore) }));
  };
  content.querySelector<HTMLButtonElement>('#m-ok')!.onclick = () => void submit();
  content.querySelector<HTMLButtonElement>('#m-cancel')!.onclick = () => close();
  amt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void submit();
  });
}

// --- edit / delete a transaction ---
async function openTx(tx: LocalTx): Promise<void> {
  const dt = new Date(tx.ts);
  const localIso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const metaLine = tx.author
    ? t('tx.meta.by', { author: tx.author, date: fullFmt().format(new Date(tx.createdAt)) })
    : t('tx.meta', { date: fullFmt().format(new Date(tx.createdAt)) });
  const content = el(`
    <div class="form">
      <h2>${esc(tx.kind === 'scheduled' ? t('tx.title.scheduled') : t('tx.title.manual'))}</h2>
      <label>${esc(t('tx.amount.label'))}
        <input id="f-amt" inputmode="decimal" value="${(tx.amountOre / 100).toString().replace('.', getLang() === 'sv' ? ',' : '.')}">
      </label>
      <label>${esc(t('tx.time'))}<input type="datetime-local" id="f-ts" value="${localIso}"></label>
      <label>${esc(t('tx.note'))}<input id="f-note" value="${esc(tx.note)}"></label>
      <div class="meta">${esc(metaLine)}</div>
      <div class="row">
        <button class="btn danger" id="f-del">${esc(t('btn.delete'))}</button>
        <button class="btn primary" id="f-save">${esc(t('btn.save'))}</button>
      </div>
    </div>
  `);
  const close = openModal(content);
  content.querySelector<HTMLButtonElement>('#f-save')!.onclick = async () => {
    const raw = content.querySelector<HTMLInputElement>('#f-amt')!.value.trim();
    const negative = raw.startsWith('-') || raw.startsWith('−');
    const ore = parseKr(raw.replace(/^[-−]/, ''));
    if (ore === null) return;
    const tsVal = content.querySelector<HTMLInputElement>('#f-ts')!.value;
    const ts = tsVal ? new Date(tsVal).getTime() : tx.ts;
    const note = content.querySelector<HTMLInputElement>('#f-note')!.value;
    await updateTx(tx.id, { amountOre: negative ? -ore : ore, note, ts });
    close();
    await refresh();
  };
  content.querySelector<HTMLButtonElement>('#f-del')!.onclick = async () => {
    await deleteTx(tx.id);
    close();
    await refresh();
  };
}

// --- new account ---
async function newAccountFlow(): Promise<void> {
  const name = await prompt2(t('account.name'), '', t('btn.create'));
  if (name === null) return;
  const acc = await createAccount(name);
  await loadAccounts();
  await setActive(acc.id);
}

// --- settings ---
function openSettings(): void {
  const acc = state.accounts.find((a) => a.id === state.activeId) ?? null;
  const content = el(`
    <div class="form">
      <h2>${esc(t('settings.title'))}</h2>
      <div class="meta">${t('settings.loggedin', { user: `<b>${esc(getUser() || '—')}</b>` })}</div>
      <div class="row">
        <button class="btn" id="s-sync">${esc(t('settings.sync'))}</button>
        <button class="btn" id="s-notify">${esc(t('settings.notify', { state: t('settings.notify.dots') }))}</button>
      </div>
      <label>${esc(t('settings.language'))}
        <select id="s-lang">
          <option value="sv" ${getLang() === 'sv' ? 'selected' : ''}>Svenska</option>
          <option value="en" ${getLang() === 'en' ? 'selected' : ''}>English</option>
        </select>
      </label>
      ${
        acc
          ? `<hr>
        <div class="meta">${t('settings.allowance.for', { name: `<b>${esc(acc.name)}</b>` })}</div>
        <label>${esc(t('settings.allowance.amount'))}
          <input id="s-amt" inputmode="decimal" value="${acc.allowanceOre ? (acc.allowanceOre / 100).toString().replace('.', getLang() === 'sv' ? ',' : '.') : ''}" placeholder="${esc(t('settings.allowance.amount.ph'))}">
        </label>
        <label>${esc(t('settings.weekday'))}
          <select id="s-day">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<option value="${i}" ${i === acc.allowanceWeekday ? 'selected' : ''}>${esc(weekdayName(i))}</option>`).join('')}</select>
        </label>
        <button class="btn primary" id="s-allow">${esc(t('settings.allowance.save'))}</button>
        <hr>
        <button class="btn" id="s-rename">${esc(t('settings.rename'))}</button>
        <button class="btn danger" id="s-delacc">${esc(t('settings.delacc'))}</button>`
          : ''
      }
      <hr>
      <button class="btn" id="s-export">${esc(t('settings.export'))}</button>
      <button class="btn danger" id="s-logout">${esc(t('settings.logout'))}</button>
    </div>
  `);
  const close = openModal(content);

  content.querySelector<HTMLSelectElement>('#s-lang')!.onchange = (e) => {
    setLang((e.target as HTMLSelectElement).value as Lang);
    close();
    void refresh();
  };

  content.querySelector<HTMLButtonElement>('#s-sync')!.onclick = () => void sync();

  const notifyBtn = content.querySelector<HTMLButtonElement>('#s-notify')!;
  const setNotifyLabel = (on: boolean) =>
    (notifyBtn.textContent = t('settings.notify', {
      state: on ? t('settings.notify.on') : t('settings.notify.off'),
    }));
  void notifyEnabled().then(setNotifyLabel);
  notifyBtn.onclick = async () => {
    const cur = await notifyEnabled();
    const now = await setNotifyPref(!cur);
    setNotifyLabel(now);
    if (now) void notify(t('brand'), t('settings.notify.test'));
  };

  content.querySelector<HTMLButtonElement>('#s-allow')?.addEventListener('click', async () => {
    if (!acc) return;
    const ore = parseKr(content.querySelector<HTMLInputElement>('#s-amt')!.value) ?? 0;
    const day = Number(content.querySelector<HTMLSelectElement>('#s-day')!.value);
    // Start from today so enabling it doesn't backfill weeks of history.
    await updateAllowance(acc.id, ore, day, Date.now());
    close();
    await runCatchUp();
    await refresh();
  });

  content.querySelector<HTMLButtonElement>('#s-rename')?.addEventListener('click', async () => {
    close();
    const name = await prompt2(t('rename.title'), acc?.name ?? '', t('btn.save'));
    if (name !== null && state.activeId) {
      await renameAccount(state.activeId, name);
      await refresh();
    }
  });

  content.querySelector<HTMLButtonElement>('#s-delacc')?.addEventListener('click', async () => {
    if (!state.activeId) return;
    if (!confirm(t('confirm.delacc'))) return;
    await deleteAccount(state.activeId);
    state.activeId = null;
    close();
    await refresh();
  });

  content.querySelector<HTMLButtonElement>('#s-export')!.onclick = async () => {
    const data = {
      app: 'kassa',
      version: 1,
      exportedAt: new Date().toISOString(),
      accounts: await exportAll(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kassa-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  content.querySelector<HTMLButtonElement>('#s-logout')!.onclick = () => {
    if (!confirm(t('confirm.logout'))) return;
    logout();
    location.reload();
  };
}

// --- modal / sheet ---
function openModal(content: HTMLElement): () => void {
  const overlay = el(`<div class="overlay"></div>`);
  const sheet = el(`<div class="sheet"></div>`);
  sheet.appendChild(content);
  overlay.appendChild(sheet);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  function close(): void {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
  }
  return close;
}

function prompt2(title: string, value: string, okLabel: string): Promise<string | null> {
  return new Promise((resolve) => {
    const content = el(`
      <div class="form">
        <h2>${esc(title)}</h2>
        <input id="p-val" value="${esc(value)}">
        <div class="row">
          <button class="btn" id="p-cancel">${esc(t('btn.cancel'))}</button>
          <button class="btn primary" id="p-ok">${esc(okLabel)}</button>
        </div>
      </div>
    `);
    const close = openModal(content);
    const input = content.querySelector<HTMLInputElement>('#p-val')!;
    setTimeout(() => input.focus(), 50);
    const done = (v: string | null) => {
      close();
      resolve(v);
    };
    content.querySelector<HTMLButtonElement>('#p-ok')!.onclick = () => done(input.value);
    content.querySelector<HTMLButtonElement>('#p-cancel')!.onclick = () => done(null);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value);
    });
  });
}

// --- toast ---
let flashTimer: number | undefined;
function flash(text: string): void {
  document.querySelector('.toast')?.remove();
  const toast = el(`<div class="toast">${esc(text)}</div>`);
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 2200);
}

// --- scheduled allowance catch-up ---
async function runCatchUp(): Promise<void> {
  const created = await catchUpSchedules();
  if (created.length) {
    void sync();
    const byAcc = new Map<string, number>();
    for (const tx of created) byAcc.set(tx.accountId, (byAcc.get(tx.accountId) ?? 0) + tx.amountOre);
    for (const [accId, ore] of byAcc) {
      const acc = state.accounts.find((a) => a.id === accId);
      void notify(t('notify.allowance.title'), t('notify.allowance.body', { amount: kr(ore), name: acc?.name ?? '' }));
    }
    await loadTxs();
    render();
  }
}

// --- login screen ---
function renderLogin(): void {
  root.innerHTML = '';
  const view = el(`
    <div class="login">
      <div class="login-brand">${esc(t('brand'))}</div>
      <p class="login-sub">${esc(t('login.sub'))}</p>
      <form id="l-form" autocomplete="on">
        <input id="l-key" type="password" autocomplete="current-password" placeholder="${esc(t('login.key'))}" inputmode="text">
        <button class="btn primary" id="l-go" type="submit">${esc(t('login.go'))}</button>
      </form>
      <div class="login-err" id="l-err"></div>
      <button class="login-lang" id="l-lang">${getLang() === 'sv' ? 'English' : 'Svenska'}</button>
    </div>
  `);
  root.appendChild(view);
  const key = view.querySelector<HTMLInputElement>('#l-key')!;
  const err = view.querySelector<HTMLDivElement>('#l-err')!;
  setTimeout(() => key.focus(), 60);
  view.querySelector<HTMLButtonElement>('#l-lang')!.onclick = () => {
    setLang(getLang() === 'sv' ? 'en' : 'sv');
    renderLogin();
  };
  view.querySelector<HTMLFormElement>('#l-form')!.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    const go = view.querySelector<HTMLButtonElement>('#l-go')!;
    go.disabled = true;
    go.textContent = t('login.going');
    try {
      await login(key.value);
      await startApp();
    } catch (ex) {
      const m = (ex as Error).message;
      err.textContent =
        m === 'unauthorized'
          ? t('login.err.unauthorized')
          : m === 'network'
            ? t('login.err.network')
            : t('login.err.other');
      go.disabled = false;
      go.textContent = t('login.go');
    }
  };
}

// --- startup ---
async function startApp(): Promise<void> {
  onSyncStatus((s) => {
    state.status = s;
    document.querySelector('.status .dot')?.setAttribute('class', `dot ${s}`);
    const label = document.querySelector('.status');
    if (label) label.lastChild!.textContent = statusLabel(s);
    if (s === 'ok') void refresh();
  });

  // Notify about transactions that arrived from the other person.
  onIncomingTxs((txs) => {
    const me = getUser();
    for (const tx of txs) {
      if (tx.kind !== 'manual' || tx.author === me) continue;
      const accName = state.accounts.find((a) => a.id === tx.accountId)?.name ?? '';
      void notify(tx.author || t('brand'), `${krSigned(tx.amountOre)} · ${accName}${tx.note ? ` (${tx.note})` : ''}`);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runCatchUp();
  });

  await refresh();
  startAutoSync();
  await runCatchUp();
}

void (async () => {
  if (isLoggedIn()) {
    await startApp();
  } else {
    renderLogin();
  }
})();
