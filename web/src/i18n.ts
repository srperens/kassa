// Minimal i18n. Language is stored in localStorage (read synchronously so the
// first render already has the right strings) and defaults to the browser's
// language. Strings support {placeholder} interpolation via t('key', {x: 1}).

export type Lang = 'sv' | 'en';

const KEY_LANG = 'kassa.lang';

export function getLang(): Lang {
  const stored = localStorage.getItem(KEY_LANG);
  if (stored === 'sv' || stored === 'en') return stored;
  return navigator.language?.toLowerCase().startsWith('sv') ? 'sv' : 'en';
}

export function setLang(lang: Lang): void {
  localStorage.setItem(KEY_LANG, lang);
}

export function locale(): string {
  return getLang() === 'sv' ? 'sv-SE' : 'en-GB';
}

type Dict = Record<string, string>;

const sv: Dict = {
  brand: 'Kassa',
  'status.idle': 'redo',
  'status.syncing': 'synkar…',
  'status.ok': 'synkad',
  'status.error': 'ej synkad',
  'status.offline': 'offline',
  'settings.title.attr': 'Synkstatus / inställningar',
  'accounts.empty.1': 'Inga konton än.',
  'accounts.empty.2': 'Tryck + för att skapa ditt första konto.',
  'accounts.new': 'Nytt konto',
  'balance.next': 'Nästa veckopeng: {date} · {amount}',
  'balance.none': 'Ingen veckopeng inställd',
  'action.add': '+ Lägg till',
  'action.sub': '− Dra av',
  'txs.empty': 'Inga händelser än.',
  'badge.allowance': '🗓 Veckopeng',
  'day.today': 'Idag',
  'day.yesterday': 'Igår',
  'amount.add.title': 'Lägg till pengar',
  'amount.sub.title': 'Dra av pengar',
  'amount.label': 'Belopp (kr)',
  'amount.note': 'Notering (valfritt)',
  'amount.note.add': 't.ex. present',
  'amount.note.sub': 't.ex. glass',
  'btn.cancel': 'Avbryt',
  'btn.add': 'Lägg till',
  'btn.sub': 'Dra av',
  'flash.added': 'La till {amount}',
  'flash.subtracted': 'Drog av {amount}',
  'tx.title.scheduled': 'Veckopeng',
  'tx.title.manual': 'Händelse',
  'tx.amount.label': 'Belopp (kr) — minus för utlägg',
  'tx.time': 'Tid',
  'tx.note': 'Notering',
  'tx.meta.by': 'Av {author} · Skapad {date}',
  'tx.meta': 'Skapad {date}',
  'btn.delete': 'Ta bort',
  'btn.save': 'Spara',
  'allowance.word': 'Veckopeng',
  'dash': '—',
  'account.name': 'Kontonamn',
  'btn.create': 'Skapa',
  'settings.title': 'Inställningar',
  'settings.loggedin': 'Inloggad som {user}',
  'settings.sync': 'Synka nu',
  'settings.notify': 'Notiser: {state}',
  'settings.notify.on': 'på',
  'settings.notify.off': 'av',
  'settings.notify.dots': '…',
  'settings.notify.test': 'Notiser är på.',
  'settings.allowance.for': 'Veckopeng för {name}',
  'settings.allowance.amount': 'Belopp (kr) — 0 = av',
  'settings.allowance.amount.ph': 't.ex. 50',
  'settings.weekday': 'Veckodag',
  'settings.allowance.save': 'Spara veckopeng',
  'settings.rename': 'Byt namn på konto',
  'settings.delacc': 'Ta bort konto',
  'settings.export': 'Exportera JSON',
  'settings.logout': 'Logga ut',
  'settings.language': 'Språk',
  'rename.title': 'Nytt namn',
  'confirm.delacc': 'Ta bort kontot och alla dess händelser?',
  'confirm.logout': 'Logga ut? Du behöver din nyckel för att logga in igen.',
  'notify.allowance.title': 'Veckopeng',
  'notify.allowance.body': '{amount} till {name}',
  'login.sub': 'Logga in med din nyckel. Den sparas på den här enheten — du gör det bara en gång.',
  'login.key': 'API-nyckel',
  'login.go': 'Logga in',
  'login.going': 'Loggar in…',
  'login.err.unauthorized': 'Fel nyckel.',
  'login.err.network': 'Ingen anslutning.',
  'login.err.other': 'Något gick fel.',
};

const en: Dict = {
  brand: 'Kassa',
  'status.idle': 'ready',
  'status.syncing': 'syncing…',
  'status.ok': 'synced',
  'status.error': 'not synced',
  'status.offline': 'offline',
  'settings.title.attr': 'Sync status / settings',
  'accounts.empty.1': 'No accounts yet.',
  'accounts.empty.2': 'Tap + to create your first account.',
  'accounts.new': 'New account',
  'balance.next': 'Next allowance: {date} · {amount}',
  'balance.none': 'No allowance set',
  'action.add': '+ Add',
  'action.sub': '− Subtract',
  'txs.empty': 'No entries yet.',
  'badge.allowance': '🗓 Allowance',
  'day.today': 'Today',
  'day.yesterday': 'Yesterday',
  'amount.add.title': 'Add money',
  'amount.sub.title': 'Subtract money',
  'amount.label': 'Amount (kr)',
  'amount.note': 'Note (optional)',
  'amount.note.add': 'e.g. gift',
  'amount.note.sub': 'e.g. ice cream',
  'btn.cancel': 'Cancel',
  'btn.add': 'Add',
  'btn.sub': 'Subtract',
  'flash.added': 'Added {amount}',
  'flash.subtracted': 'Subtracted {amount}',
  'tx.title.scheduled': 'Allowance',
  'tx.title.manual': 'Entry',
  'tx.amount.label': 'Amount (kr) — minus for spending',
  'tx.time': 'Time',
  'tx.note': 'Note',
  'tx.meta.by': 'By {author} · Created {date}',
  'tx.meta': 'Created {date}',
  'btn.delete': 'Delete',
  'btn.save': 'Save',
  'allowance.word': 'Allowance',
  'dash': '—',
  'account.name': 'Account name',
  'btn.create': 'Create',
  'settings.title': 'Settings',
  'settings.loggedin': 'Logged in as {user}',
  'settings.sync': 'Sync now',
  'settings.notify': 'Notifications: {state}',
  'settings.notify.on': 'on',
  'settings.notify.off': 'off',
  'settings.notify.dots': '…',
  'settings.notify.test': 'Notifications are on.',
  'settings.allowance.for': 'Allowance for {name}',
  'settings.allowance.amount': 'Amount (kr) — 0 = off',
  'settings.allowance.amount.ph': 'e.g. 50',
  'settings.weekday': 'Weekday',
  'settings.allowance.save': 'Save allowance',
  'settings.rename': 'Rename account',
  'settings.delacc': 'Delete account',
  'settings.export': 'Export JSON',
  'settings.logout': 'Log out',
  'settings.language': 'Language',
  'rename.title': 'New name',
  'confirm.delacc': 'Delete the account and all its entries?',
  'confirm.logout': "Log out? You'll need your key to log in again.",
  'notify.allowance.title': 'Allowance',
  'notify.allowance.body': '{amount} to {name}',
  'login.sub': "Log in with your key. It's stored on this device — you only do it once.",
  'login.key': 'API key',
  'login.go': 'Log in',
  'login.going': 'Logging in…',
  'login.err.unauthorized': 'Wrong key.',
  'login.err.network': 'No connection.',
  'login.err.other': 'Something went wrong.',
};

const dicts: Record<Lang, Dict> = { sv, en };

export function t(key: string, params?: Record<string, string | number>): string {
  const dict = dicts[getLang()];
  let s = dict[key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

// Localised long weekday name for index 0..6 (0 = Sunday), for the picker.
export function weekdayName(index: number): string {
  // 2024-01-07 is a Sunday; offsetting by index gives the right weekday.
  const d = new Date(2024, 0, 7 + index);
  return new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(d);
}
