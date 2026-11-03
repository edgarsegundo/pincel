import { expect, test } from 'vitest';
import { screenToBoard, zoomAt } from './viewport';

test('zoom mantém o ponto sob o cursor fixo', () => {
  const v = { x: 30, y: -10, zoom: 1 };
  const before = screenToBoard(v, 200, 150);
  const after = screenToBoard(zoomAt(v, 200, 150, 2), 200, 150);
  expect(after[0]).toBeCloseTo(before[0]);
  expect(after[1]).toBeCloseTo(before[1]);
});
