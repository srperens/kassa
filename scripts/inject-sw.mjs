// Injects the precache list + a build id into the built service worker.
// Vite hashes asset filenames, so we discover them from dist/public after the
// build and bake them into sw.js, replacing the __BUILD_ID__ / __PRECACHE_LIST__
// placeholders. This lets the SW precache the app shell on install (offline launch).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'public');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(pub)
  .map((p) => '/' + relative(pub, p).split(sep).join('/'))
  .filter((u) => u !== '/sw.js'); // never precache the SW itself

// '/' (the start_url) returns index.html; cache it too for the navigation fallback.
const precache = ['/', ...files];
const buildId = createHash('sha1').update(files.slice().sort().join('|')).digest('hex').slice(0, 8);

const swPath = join(pub, 'sw.js');
const sw = readFileSync(swPath, 'utf8')
  .replace('__BUILD_ID__', buildId)
  .replace('__PRECACHE_LIST__', JSON.stringify(precache));
writeFileSync(swPath, sw);
console.log(`sw: build ${buildId}, precaching ${precache.length} urls`);
