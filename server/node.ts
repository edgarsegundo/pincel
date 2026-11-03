import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleShapeRequest, type Deps, type Env } from './handler.ts';

/** Converte um pedido do Node em Request, chama o handler e escreve a Response. */
export function nodeListener(getEnv: () => Env, deps: Deps = {}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > 16 * 1024) { res.writeHead(413).end(); return; }
      chunks.push(c as Buffer);
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
      method: req.method,
      headers,
      body: hasBody ? Buffer.concat(chunks) : undefined,
    });
    const response = await handleShapeRequest(request, getEnv(), { ...deps, ip: req.socket.remoteAddress }); // IP do socket, nunca de cabeçalhos do cliente
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
