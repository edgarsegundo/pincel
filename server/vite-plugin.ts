import { loadEnv, type Plugin } from 'vite';
import { nodeListener } from './node.ts';

/**
 * No `npm run dev` o proxy roda dentro do servidor do Vite (nenhum processo extra).
 * A chave vem de `.env.local` (TYPESAFE_API_KEY=...) e nunca entra no bundle: só variáveis
 * VITE_* chegam ao navegador.
 */
export function jevDevProxy(mode: string): Plugin {
  return {
    name: 'pincel-jev-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '');
      const listener = nodeListener(() => ({
        TYPESAFE_API_KEY: env.TYPESAFE_API_KEY,
        JEV_MODEL: env.JEV_MODEL,
        RATE_LIMIT_PER_MIN: env.RATE_LIMIT_PER_MIN,
        GLOBAL_RATE_LIMIT_PER_MIN: env.GLOBAL_RATE_LIMIT_PER_MIN,
      }));
      server.middlewares.use('/api/shape', (req, res, next) => {
        listener(req, res).catch(next);
      });
    },
  };
}
