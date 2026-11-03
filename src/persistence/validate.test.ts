import { expect, test, vi } from 'vitest';

vi.stubGlobal('matchMedia', () => ({ matches: false }));
const { parseBoard, sanitizeObjects } = await import('./validate');

const ok = { id: 'a', type: 'rectangle', color: 'ink', size: 'm', seed: 1, createdAt: 0, x: 0, y: 0, w: 10, h: 10 };

test('aceita quadro válido e descarta objetos malformados', () => {
  const b = parseBoard(JSON.stringify({ version: 1, objects: [ok, { ...ok, id: 'b', w: 'x' }, { id: 'c', type: 'nope' }], viewport: { x: 1, y: 2, zoom: 2 } }));
  expect(b?.objects.map((o) => o.id)).toEqual(['a']);
  expect(b?.viewport).toEqual({ x: 1, y: 2, zoom: 2 });
});

test('rejeita JSON inválido e versão desconhecida', () => {
  expect(parseBoard('{nao é json')).toBeNull();
  expect(parseBoard(JSON.stringify({ version: 2, objects: [] }))).toBeNull();
  expect(parseBoard(JSON.stringify({ version: 1 }))).toBeNull();
});

test('viewport inválido cai no padrão', () => {
  expect(parseBoard(JSON.stringify({ version: 1, objects: [], viewport: { x: 'a', y: 0, zoom: 0 } }))?.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
});

test('sanitizeObjects tolera lixo', () => {
  expect(sanitizeObjects(null)).toEqual([]);
  expect(sanitizeObjects([null, 1, 'x'])).toEqual([]);
});

test('campos opcionais malformados são removidos, mantendo o objeto', () => {
  const bad = { ...ok, id: 'b', label: { text: 5 }, fill: 'xyz', recognizedFrom: { stroke: 'x' } };
  const [o] = sanitizeObjects([bad]) as any[];
  expect(o.id).toBe('b');
  expect(o.label).toBeUndefined();
  expect(o.fill).toBeUndefined();
  expect(o.recognizedFrom).toBeUndefined();
});

test('rótulo e preenchimento válidos são preservados', () => {
  const [o] = sanitizeObjects([{ ...ok, label: { text: 'Oi' }, fill: 'solid' }]) as any[];
  expect(o.label).toEqual({ text: 'Oi' });
  expect(o.fill).toBe('solid');
});

test('ligações malformadas ou fora de linhas são removidas', () => {
  const line = { id: 'l', type: 'line', color: 'ink', size: 'm', seed: 1, createdAt: 0, from: [0, 0], to: [1, 1], arrowhead: 'none' };
  const [a, b] = sanitizeObjects([
    { ...line, bindings: { from: { objectId: 'r', anchor: [0, 0.5] }, to: { objectId: 5, anchor: 'x' } } },
    { ...line, id: 'm', bindings: { to: { objectId: 5 } } },
  ]) as any[];
  expect(a.bindings).toEqual({ from: { objectId: 'r', anchor: [0, 0.5] } });
  expect(b.bindings).toBeUndefined();
});

test('ids repetidos: mantém só o primeiro', () => {
  expect(sanitizeObjects([ok, { ...ok, x: 99 }]).length).toBe(1);
});
