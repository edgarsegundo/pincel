// Lista os modelos disponíveis no JEV (para escolher/pinar JEV_MODEL). Uso: npm run jev:models
import { existsSync, readFileSync } from 'node:fs';

let key = process.env.TYPESAFE_API_KEY;
if (!key && existsSync('.env.local')) {
  key = readFileSync('.env.local', 'utf8').split('\n').map((l) => l.match(/^TYPESAFE_API_KEY=(.*)$/)?.[1]?.trim()).find(Boolean);
}
if (!key) { console.error('Defina TYPESAFE_API_KEY em .env.local'); process.exit(1); }

const res = await fetch('https://api.typesafe.ai/v1/models', { headers: { authorization: `Bearer ${key}` } });
console.log(res.status, await res.text());
