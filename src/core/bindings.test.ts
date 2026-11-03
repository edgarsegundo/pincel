import { expect, test, vi } from 'vitest';

vi.stubGlobal('matchMedia', () => ({ matches: false }));
const { connectLine, reconnect, pruneBindings } = await import('./bindings');
const { cloneObjects } = await import('./clipboard');
import type { Line, Rectangle } from './types';

const base = { color: 'ink' as const, size: 'm' as const, seed: 1, createdAt: 0 };
const rect: Rectangle = { ...base, id: 'r', type: 'rectangle', x: 100, y: 100, w: 100, h: 60 };
const line = (to: [number, number]): Line => ({ ...base, id: 'l', type: 'line', from: [0, 0], to, arrowhead: 'none' });

test('ponta perto do contorno gruda e liga à forma', () => {
  const l = connectLine(line([97, 130]), [rect], 1);
  expect(l.to).toEqual([100, 130]);
  expect(l.bindings?.to?.objectId).toBe('r');
  expect(l.bindings?.from).toBeUndefined();
});

test('ponta longe da forma não liga', () => {
  expect(connectLine(line([60, 130]), [rect], 1).bindings).toBeUndefined();
});

test('mover a forma move a ponta; linha movida sozinha se solta', () => {
  const l = connectLine(line([97, 130]), [rect], 1);
  const moved = { ...rect, x: 150 };
  const follow = reconnect([moved, l], new Set(['r'])).find((o) => o.id === 'l') as Line;
  expect(follow.to).toEqual([150, 130]);
  const alone = reconnect([rect, l], new Set(['l'])).find((o) => o.id === 'l') as Line;
  expect(alone.bindings).toBeUndefined();
});

test('apagar a forma remove a ligação, mantendo a linha', () => {
  const l = connectLine(line([97, 130]), [rect], 1);
  const out = pruneBindings([l]);
  expect((out[0] as Line).bindings).toBeUndefined();
});

test('copiar só a linha não mantém ligação com a forma original', () => {
  const l = connectLine(line([97, 130]), [rect], 1);
  expect((cloneObjects([l])[0] as Line).bindings).toBeUndefined();
  const both = cloneObjects([rect, l]);
  expect((both[1] as Line).bindings?.to?.objectId).toBe(both[0]!.id);
});
