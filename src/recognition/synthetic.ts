import type { Vec2 } from '../core/types';

/** Gerador de traços sintéticos "desenhados à mão" para testes (determinístico por semente). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

type R = () => number;
const range = (r: R, a: number, b: number) => a + (b - a) * r();

/** Percorre um contorno (fechado ou aberto) com tremor suave + ruído e espaçamento irregular. */
export function trace(outline: Vec2[], closed: boolean, r: R, opts: { wobble?: number; noise?: number; overshoot?: number } = {}): number[] {
  const { wobble = 0.02, noise = 0.004, overshoot = 0.06 } = opts;
  const pts = closed ? [...outline, outline[0]!] : outline;
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  const total = len * (1 + (closed ? overshoot * r() : 0));
  const f1 = range(r, 1.5, 3), f2 = range(r, 4, 7), p1 = r() * 6.28, p2 = r() * 6.28;
  const out: number[] = [];
  const start = closed ? r() * len : 0;
  let d = 0;
  while (d <= total) {
    const t = (start + d) % len || (closed ? 0 : d);
    const at = closed ? t : Math.min(d, len);
    // posição ao longo do contorno
    let acc = 0, x = pts[0]![0], y = pts[0]![1], nx = 0, ny = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
      if (acc + seg >= at || i === pts.length - 1) {
        const k = seg ? Math.min(1, (at - acc) / seg) : 0;
        x = pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * k;
        y = pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * k;
        nx = seg ? -(pts[i]![1] - pts[i - 1]![1]) / seg : 0;
        ny = seg ? (pts[i]![0] - pts[i - 1]![0]) / seg : 0;
        break;
      }
      acc += seg;
    }
    const u = d / total;
    const w = wobble * len / 4 * (Math.sin(u * f1 * 6.28 + p1) * 0.7 + Math.sin(u * f2 * 6.28 + p2) * 0.3);
    const n = (r() - 0.5) * 2 * noise * len / 4;
    out.push(x + nx * (w + n), y + ny * (w + n), 0.5);
    d += range(r, 2, 9);
  }
  return out;
}

const ellipsePts = (cx: number, cy: number, rx: number, ry: number, n = 120): Vec2[] =>
  Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * 6.283), cy + ry * Math.sin((i / n) * 6.283)] as Vec2);

export type Label = 'line' | 'rectangle' | 'diamond' | 'ellipse' | 'triangle' | 'none';

export function sample(label: Label, r: R): number[] {
  const w = range(r, 90, 380), h = range(r, 90, 380), x = r() * 500, y = r() * 500;
  switch (label) {
    case 'line': {
      const a = r() * 6.28, l = range(r, 80, 450);
      return trace([[x, y], [x + l * Math.cos(a), y + l * Math.sin(a)]], false, r, { wobble: 0.012, noise: 0.004 });
    }
    case 'rectangle': return trace([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, r);
    case 'diamond': return trace([[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]], true, r);
    case 'ellipse': return trace(ellipsePts(x, y, w / 2, h / 2), true, r);
    case 'triangle': {
      const apex = range(r, 0.25, 0.75);
      return trace([[x + w * apex, y], [x + w, y + h], [x, y + h]], true, r);
    }
    default: return negative(r);
  }
}

/** Traços que NÃO devem virar forma. */
function negative(r: R): number[] {
  const kind = Math.floor(r() * 7);
  const x = r() * 300, y = r() * 300, s = range(r, 80, 300);
  switch (kind) {
    case 0: return trace(Array.from({ length: 60 }, (_, i) => [x + (i / 59) * s * 1.5, y + Math.sin((i / 59) * 6.28 * 2) * s * 0.3] as Vec2), false, r, { wobble: 0.01 }); // onda
    case 1: return trace(Array.from({ length: 90 }, (_, i) => { const a = (i / 89) * 6.283 * 0.62; return [x + s * Math.cos(a), y + s * Math.sin(a)] as Vec2; }), false, r); // "C"
    case 2: return trace([[x, y + s * 0.5], [x + s * 0.35, y + s], [x + s, y]], false, r, { wobble: 0.01 }); // visto ✓
    case 3: return trace(Array.from({ length: 140 }, (_, i) => { const a = (i / 139) * 6.283 * 2.5; const rr = (s / 2) * (0.25 + i / 139); return [x + rr * Math.cos(a), y + rr * Math.sin(a)] as Vec2; }), false, r); // espiral
    case 4: return trace(Array.from({ length: 100 }, (_, i) => { const a = (i / 99) * 6.283; return [x + s * Math.cos(a) * 0.9 + (i / 99) * s * 0.6, y + s * 0.6 * Math.sin(2 * a)] as Vec2; }), false, r); // oito
    case 5: return trace([[x, y], [x + s, y], [x + s, y + s * 0.7]], false, r); // "L" invertido
    default: return trace([[x, y], [x + s * 0.5, y + s], [x + s, y + s * 0.2], [x + s * 1.4, y + s * 0.9]], false, r, { wobble: 0.01 }); // zigue-zague
  }
}
