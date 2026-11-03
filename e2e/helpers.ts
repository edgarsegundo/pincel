import type { Page } from '@playwright/test';

export type P = [number, number];

export async function stroke(page: Page, pts: P[], opts: { holdMs?: number; endPts?: P[] } = {}) {
  await page.mouse.move(pts[0]![0], pts[0]![1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y);
  if (opts.holdMs) await page.waitForTimeout(opts.holdMs);
  for (const [x, y] of opts.endPts ?? []) await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(350); // animação de conversão
}

const jitter = (i: number) => Math.sin(i * 1.7) * 1.8 + Math.cos(i * 0.9) * 1.2;

export function circle(cx: number, cy: number, r: number, n = 70): P[] {
  return Array.from({ length: n + 4 }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rr = r + jitter(i);
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)] as P;
  });
}

function along(corners: P[], per: number): P[] {
  const out: P[] = [];
  let k = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!, b = corners[(i + 1) % corners.length]!;
    for (let j = 0; j < per; j++, k++) out.push([a[0] + ((b[0] - a[0]) * j) / per + jitter(k), a[1] + ((b[1] - a[1]) * j) / per + jitter(k + 3)]);
  }
  out.push([corners[0]![0] + 2, corners[0]![1] + 1]);
  return out;
}

export const rect = (x: number, y: number, w: number, h: number) => along([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], 22);
export const tri = (x: number, y: number, w: number, h: number) => along([[x + w / 2, y], [x + w, y + h], [x, y + h]], 28);

export const types = (page: Page) => page.evaluate(() => (window as any).__pincel.store.getState().objects.map((o: any) => o.type));
export const objects = (page: Page) => page.evaluate(() => (window as any).__pincel.store.getState().objects);

/** Retângulo com tremor: o reconhecedor local sozinho não converte ao soltar (ambíguo para a IA). */
export const wobblyRect = (x: number, y: number, w: number, h: number, amp = 5) =>
  rect(x, y, w, h).map(([px, py], i) => [px + Math.sin(i * 0.5) * amp, py + Math.cos(i * 0.4) * amp] as P);

/** Losango com tremor (mesma ideia do wobblyRect): o local sozinho não converte ao soltar. */
export const wobblyDiamond = (cx: number, cy: number, w: number, h: number, amp = 11) =>
  along([[cx, cy - h / 2], [cx + w / 2, cy], [cx, cy + h / 2], [cx - w / 2, cy]], 22).map(([px, py], i) => [px + Math.sin(i * 0.5) * amp, py + Math.cos(i * 0.4) * amp] as P);
