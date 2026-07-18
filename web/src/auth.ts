// Authentication: a single API key, entered once on the login screen and kept in
// localStorage so it survives across PWA launches. The key is sent as a Bearer
// token on every sync. The server maps the key to a user name, which we cache and
// use to attribute transactions ("who made this").

const KEY_TOKEN = 'kassa.token';
const KEY_USER = 'kassa.user';
const KEY_READONLY = 'kassa.readonly';

export function getToken(): string {
  return localStorage.getItem(KEY_TOKEN) ?? '';
}
export function getUser(): string {
  return localStorage.getItem(KEY_USER) ?? '';
}
// A "view" login: can see everything but not add/edit/delete anything.
export function isReadonly(): boolean {
  return localStorage.getItem(KEY_READONLY) === '1';
}
export function isLoggedIn(): boolean {
  return !!getToken() && !!getUser();
}

export function logout(): void {
  localStorage.removeItem(KEY_TOKEN);
  localStorage.removeItem(KEY_USER);
  localStorage.removeItem(KEY_READONLY);
}

// Validate a key against the server. On success, store it + the user name and
// return the name. Throws 'unauthorized' on a bad key, 'network' if offline.
export async function login(token: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/login', {
      method: 'POST',
      headers: { authorization: `Bearer ${token.trim()}` },
    });
  } catch {
    throw new Error('network');
  }
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error('server');
  const data = (await res.json()) as { ok: boolean; user: string; readonly?: boolean };
  localStorage.setItem(KEY_TOKEN, token.trim());
  localStorage.setItem(KEY_USER, data.user);
  localStorage.setItem(KEY_READONLY, data.readonly ? '1' : '0');
  return data.user;
}
