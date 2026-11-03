// Falha se o JS inicial (gzip) passar do orçamento da spec (60 KB).
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LIMIT_KB = 60;
const dir = new URL('../dist/assets/', import.meta.url);
let total = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const kb = gzipSync(readFileSync(new URL(f, dir))).length / 1024;
  total += kb;
  console.log(`${f.padEnd(40)} ${kb.toFixed(1)} KB gzip`);
}
console.log(`JS total: ${total.toFixed(1)} KB gzip (limite ${LIMIT_KB} KB)`);
if (total > LIMIT_KB) { console.error('Orçamento estourado'); process.exit(1); }
