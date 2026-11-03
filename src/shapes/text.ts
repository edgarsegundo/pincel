import { TEXT_PX, type Box, type Size, type Text, type Vec2 } from '../core/types';

export const FONT_FAMILY = "Caveat, 'Segoe Print', cursive";
export const LINE_HEIGHT = 1.25;
export const textFont = (size: Size) => `500 ${TEXT_PX[size]}px ${FONT_FAMILY}`;

let mctx: CanvasRenderingContext2D | null = null;
const measureCtx = () => (mctx ??= document.createElement('canvas').getContext('2d')!);
const widthCache = new Map<string, number>();
export const clearTextCache = () => widthCache.clear();

function lineWidth(font: string, line: string) {
  const key = font + '|' + line;
  let w = widthCache.get(key);
  if (w === undefined) {
    const c = measureCtx();
    c.font = font;
    w = c.measureText(line).width;
    if (widthCache.size > 2000) widthCache.clear();
    widthCache.set(key, w);
  }
  return w;
}

export const text = {
  type: 'text' as const,
  bounds(o: Text): Box {
    const lines = o.text.split('\n');
    const font = textFont(o.size);
    const w = Math.max(...lines.map((l) => lineWidth(font, l)), 4);
    return { x: o.x, y: o.y, w, h: lines.length * TEXT_PX[o.size] * LINE_HEIGHT };
  },
  hitTest(o: Text, p: Vec2, tol: number) {
    const b = text.bounds(o);
    return p[0] >= b.x - tol && p[0] <= b.x + b.w + tol && p[1] >= b.y - tol && p[1] <= b.y + b.h + tol;
  },
  translate(o: Text, d: Vec2): Text {
    return { ...o, x: o.x + d[0], y: o.y + d[1] };
  },
};

export function drawText(ctx: CanvasRenderingContext2D, o: Text) {
  const lh = TEXT_PX[o.size] * LINE_HEIGHT;
  ctx.font = textFont(o.size);
  ctx.textBaseline = 'middle';
  o.text.split('\n').forEach((line, i) => ctx.fillText(line, o.x, o.y + lh * (i + 0.5)));
}

/** Quebra o texto em linhas que cabem em maxWidth (respeita quebras manuais). */
export function wrapText(text: string, maxWidth: number, font: string): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (line && lineWidth(font, next) > maxWidth) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

export function drawLabel(ctx: CanvasRenderingContext2D, o: { size: Size; label?: { text: string } }, box: Box) {
  if (!o.label?.text) return;
  const font = textFont(o.size);
  const lh = TEXT_PX[o.size] * LINE_HEIGHT;
  const lines = wrapText(o.label.text, box.w, font);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y0 = box.y + box.h / 2 - (lines.length * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, box.x + box.w / 2, y0 + lh * (i + 0.5)));
  ctx.textAlign = 'left';
}
