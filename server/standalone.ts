/**
 * Servidor do proxy para produção (ou para rodar separado do Vite):
 *   TYPESAFE_API_KEY=... ALLOWED_ORIGIN=https://seu-site node server/standalone.ts
 * Node 22+ executa TypeScript direto (sem build).
 */
import { createServer } from 'node:http';
import { nodeListener } from './node.ts';

const env = () => ({
  TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
  JEV_MODEL: process.env.JEV_MODEL,
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
  RATE_LIMIT_PER_MIN: process.env.RATE_LIMIT_PER_MIN,
  GLOBAL_RATE_LIMIT_PER_MIN: process.env.GLOBAL_RATE_LIMIT_PER_MIN,
  TRUST_PROXY: process.env.TRUST_PROXY,
});
const listener = nodeListener(env);
const port = Number(process.env.PORT) || 8787;

createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, configured: !!process.env.TYPESAFE_API_KEY })); return; }
  if (req.url?.startsWith('/api/shape')) { listener(req, res).catch(() => res.writeHead(500).end()); return; }
  res.writeHead(404).end();
}).listen(port, () => console.log(`Proxy do JEV em http://localhost:${port}/api/shape (chave ${process.env.TYPESAFE_API_KEY ? 'configurada' : 'AUSENTE'})`));
