// Lista os modelos disponíveis no JEV (para escolher/pinar JEV_MODEL). Uso: npm run jev:models
import { existsSync, readFileSync } from 'node:fs';

let key = process.env.TYPESAFE_API_KEY;
for (const file of ['.env.local', '.env']) {
  if (key || !existsSync(file)) continue;
  key = readFileSync(file, 'utf8').split('\n').map((l) => l.match(/^TYPESAFE_API_KEY=["']?([^"'\s]*)/)?.[1]).find(Boolean);
}
if (!key) { console.error('Defina TYPESAFE_API_KEY em .env.local (ou .env)'); process.exit(1); }

const res = await fetch('https://api.typesafe.ai/v1/models', { headers: { authorization: `Bearer ${key}` } });
console.log(res.status, await res.text());
