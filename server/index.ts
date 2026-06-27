import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { SyncRequest, SyncResponse } from '../shared/types.js';
import { applyAccount, applyTx, changesSince, currentSeq, tx } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

// Named API keys: "name:token,name:token". Each person logs in with their token;
// the matching name is used to attribute transactions and can be revoked alone.
const RAW_TOKENS = process.env.KASSA_TOKENS ?? 'dev:dev-token';
const TOKENS = new Map<string, string>(); // token -> user name
for (const pair of RAW_TOKENS.split(',')) {
  const idx = pair.indexOf(':');
  if (idx <= 0) continue;
  const name = pair.slice(0, idx).trim();
  const token = pair.slice(idx + 1).trim();
  if (name && token) TOKENS.set(token, name);
}

const app = Fastify({ logger: true });

// Returns the user name for a valid Bearer token, or null if unauthorized.
function userFor(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const h = req.headers['authorization'];
  const header = Array.isArray(h) ? h[0] : h;
  if (!header || !header.startsWith('Bearer ')) return null;
  return TOKENS.get(header.slice(7)) ?? null;
}

// The login screen calls this once to validate a key and learn the user's name.
app.post('/api/login', async (req, reply) => {
  const user = userFor(req);
  if (!user) return reply.code(401).send({ error: 'unauthorized' });
  return { ok: true, user };
});

app.post('/api/sync', async (req, reply) => {
  const user = userFor(req);
  if (!user) return reply.code(401).send({ error: 'unauthorized' });

  const body = req.body as SyncRequest;
  const since = Number.isFinite(body?.since) ? body.since : 0;

  // Apply the client's changes in a transaction, then read out everything newer.
  const result = tx((): SyncResponse => {
    for (const account of body.accounts ?? []) applyAccount(account);
    for (const t of body.txs ?? []) applyTx(t);
    const changes = changesSince(since);
    return { seq: currentSeq(), ...changes };
  })();

  return result;
});

app.get('/api/health', async () => ({ ok: true, seq: currentSeq() }));

// Serve the built PWA in production (dist/public). In dev Vite serves it.
const publicDir = join(__dirname, '..', 'public');
if (existsSync(publicDir)) {
  await app.register(fastifyStatic, { root: publicDir });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'not found' });
    return reply.sendFile('index.html'); // SPA fallback
  });
}

app
  .listen({ port: PORT, host: HOST })
  .then(() => app.log.info(`kassa server on http://${HOST}:${PORT} (${TOKENS.size} key(s) loaded)`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
