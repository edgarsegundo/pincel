import type { LocalScores, ShapeRequest, StrokeFeatures } from '../../server/types';
import type { Vec2 } from '../core/types';
import { dist, polylineLength, signedArea } from '../shapes/geometry';
import type { Prepared } from './prepare';

/** Virada mínima (graus) para uma curva contar como canto / como curva. */
export const CORNER_DEG = 65;
export const BEND_DEG = 35;
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Ramer-Douglas-Peucker em polilinha aberta. */
export function rdp(pts: Vec2[], eps: number): Vec2[] {
  if (pts.length < 3) return pts;
  const a = pts[0]!, b = pts[pts.length - 1]!;
  const len = dist(a, b);
  let maxD = -1, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const d = len === 0 ? dist(p, a) : Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

/** Vértices de um laço (traço fechado): divide no ponto mais distante do início e simplifica cada metade. */
export function loopVertices(pts: Vec2[], eps: number): Vec2[] {
  let far = 0;
  for (let i = 1; i < pts.length; i++) if (dist(pts[i]!, pts[0]!) > dist(pts[far]!, pts[0]!)) far = i;
  const first = rdp(pts.slice(0, far + 1), eps);
  const second = rdp([...pts.slice(far), pts[0]!], eps);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function angleBetween(ax: number, ay: number, bx: number, by: number) {
  const cos = (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * Curvas do contorno: o ângulo de virada é medido entre cordas de ~10% do perímetro, o que ignora
 * ondulações pequenas da mão. Devolve só os picos locais (uma entrada por curva), em ordem do traço.
 */
export function bendPeaks(pts: Vec2[], minDeg: number): number[] {
  const n = pts.length;
  const w = Math.max(2, Math.round(n * 0.1));
  const at = (i: number) => pts[((i % n) + n) % n]!;
  const turn = pts.map((p, i) => {
    const a = at(i - w), b = at(i + w);
    return angleBetween(p[0] - a[0], p[1] - a[1], b[0] - p[0], b[1] - p[1]);
  });
  const peaks: number[] = [];
  for (let i = 0; i < n; i++) {
    if (turn[i]! < minDeg) continue;
    let isMax = true;
    for (let k = -w; k <= w && isMax; k++) {
      const j = ((i + k) % n + n) % n;
      if (k !== 0 && (turn[j]! > turn[i]! || (turn[j]! === turn[i]! && k < 0))) isMax = false;
    }
    if (isMax) peaks.push(turn[i]!);
  }
  return peaks;
}

function crosses(a: Vec2, b: Vec2, c: Vec2, d: Vec2) {
  const o = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

function selfIntersections(pts: Vec2[]) {
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++)
    for (let j = i + 2; j < pts.length - 1; j++) if (crosses(pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!)) n++;
  return n;
}

/** Características que o JEV recebe no lugar de coordenadas brutas (mais baratas e muito mais informativas). */
export function strokeFeatures(s: Prepared): StrokeFeatures {
  const pts = s.pts;
  const bends = bendPeaks(pts, BEND_DEG);

  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const radii = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
  const meanR = radii.reduce((a, r) => a + r, 0) / radii.length || 1;
  const radiusCv = Math.sqrt(radii.reduce((a, r) => a + (r - meanR) ** 2, 0) / radii.length) / meanR;

  const area = Math.abs(signedArea(pts));
  const perimeter = polylineLength([...pts, pts[0]!]);
  const { w, h } = s.box;

  return {
    closed: s.closed,
    gap_ratio: round(s.gap),
    aspect_ratio: round(Math.max(w, h) / (Math.min(w, h) || 1)),
    bbox_fill: round(area / ((w * h) || 1)),
    circularity: round((4 * Math.PI * area) / (perimeter * perimeter || 1)),
    radius_cv: round(radiusCv),
    bend_count: bends.length,
    corner_count: bends.filter((t) => t >= CORNER_DEG).length,
    turning_angles_deg: bends.slice(0, 12).map((t) => Math.round(t)),
    self_intersections: selfIntersections(pts),
  };
}

/** Contorno simplificado em [0..1] com escala uniforme (preserva a proporção). */
export function normalizedOutline(s: Prepared, max = 16): [number, number][] {
  let verts = loopVertices(s.pts, 0.06 * s.diag);
  for (let eps = 0.08; verts.length > max && eps < 0.3; eps += 0.03) verts = loopVertices(s.pts, eps * s.diag);
  const scale = Math.max(s.box.w, s.box.h) || 1;
  return verts.slice(0, max).map((v) => [round((v[0] - s.box.x) / scale), round((v[1] - s.box.y) / scale)]);
}

export function buildShapeRequest(s: Prepared, local: LocalScores): ShapeRequest {
  return {
    v: 1,
    features: strokeFeatures(s),
    local_scores: Object.fromEntries(Object.entries(local).map(([k, v]) => [k, round(v ?? 0)])),
    outline: normalizedOutline(s),
  };
}
