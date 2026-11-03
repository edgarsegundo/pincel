import { beforeEach, expect, test, vi } from 'vitest';

vi.stubGlobal('matchMedia', () => ({ matches: false }));
const { addObject, undo, redo, store, removeObjects, clearBoard, commitWithViewport, setViewport } = await import('./store');
const obj = (id: string) => ({ id, type: 'freehand' as const, color: 'ink' as const, size: 'm' as const, seed: 1, createdAt: 0, points: [0, 0, 1] });

beforeEach(() => store.setState({ objects: [], past: [], future: [], selection: [] }));

test('desfazer e refazer', () => {
  addObject(obj('a'));
  addObject(obj('b'));
  undo();
  expect(store.getState().objects.map((o) => o.id)).toEqual(['a']);
  redo();
  expect(store.getState().objects).toHaveLength(2);
});

test('remover limpa a seleção e é desfazível', () => {
  addObject(obj('a'));
  store.setState({ selection: ['a'] });
  removeObjects(['a']);
  expect(store.getState().selection).toEqual([]);
  undo();
  expect(store.getState().objects).toHaveLength(1);
});

test('a notificação "Quadro limpo" some quando há nova edição, para o Desfazer não atingir outra ação', () => {
  addObject(obj('a'));
  clearBoard();
  expect(store.getState().toast).toBe('cleared');
  addObject(obj('b'));
  expect(store.getState().toast).toBeNull();
});

test('o Desfazer da notificação restaura o quadro limpo', () => {
  addObject(obj('a'));
  clearBoard();
  undo();
  expect(store.getState().objects.map((o) => o.id)).toEqual(['a']);
  expect(store.getState().toast).toBeNull();
});

test('desfazer/refazer a importação leva a tela junto; outras ações não mexem na tela', () => {
  addObject(obj('a'));
  setViewport({ x: 10, y: 20, zoom: 2 });
  commitWithViewport([obj('imp')], { x: -500, y: -500, zoom: 0.5 });
  expect(store.getState().viewport).toEqual({ x: -500, y: -500, zoom: 0.5 });
  undo();
  expect(store.getState().viewport).toEqual({ x: 10, y: 20, zoom: 2 });
  redo();
  expect(store.getState().viewport).toEqual({ x: -500, y: -500, zoom: 0.5 });

  // desfazer um desenho feito depois da importação não deve mover a tela
  addObject(obj('depois'));
  setViewport({ x: 1, y: 2, zoom: 1 });
  undo();
  expect(store.getState().viewport).toEqual({ x: 1, y: 2, zoom: 1 });
});
