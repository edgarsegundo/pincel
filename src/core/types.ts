export type Vec2 = [number, number];
export type ColorToken = 'ink' | 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet';
export type Size = 's' | 'm' | 'l';

export interface BaseObject {
  id: string;
  type: string;
  color: ColorToken;
  size: Size;
  seed: number;
  createdAt: number;
  /** Presente quando o objeto nasceu da conversão de um traço livre. */
  recognizedFrom?: RecognizedFrom;
}

export interface RecognizedFrom {
  stroke: number[]; // traço original [x, y, p, ...]
  source: 'local' | 'ai';
  confidence: number;
  trigger: 'release' | 'hold';
  at: number;
}

/** points: x, y, pressão intercalados */
export interface Freehand extends BaseObject {
  type: 'freehand';
  points: number[];
}

export interface Text extends BaseObject {
  type: 'text';
  x: number; // canto superior esquerdo
  y: number;
  text: string;
}

export type Fill = 'none' | 'solid' | 'hachure';
export interface Label { text: string }
/** Campos comuns das formas fechadas. */
interface Closed extends BaseObject { fill?: Fill; label?: Label }

/** Ligação de uma ponta de linha a uma forma; anchor é a posição normalizada (0..1) na caixa da forma. */
export interface Binding { objectId: string; anchor: Vec2 }
export interface Line extends BaseObject {
  type: 'line';
  from: Vec2;
  to: Vec2;
  arrowhead: 'none' | 'end' | 'both';
  bindings?: { from?: Binding; to?: Binding };
}
export interface Rectangle extends Closed { type: 'rectangle'; x: number; y: number; w: number; h: number }
export interface Diamond extends Closed { type: 'diamond'; x: number; y: number; w: number; h: number }
export interface Ellipse extends Closed { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
export interface Triangle extends Closed { type: 'triangle'; vertices: [Vec2, Vec2, Vec2] }

export type Shape = Line | Rectangle | Diamond | Ellipse | Triangle;
export type WhiteboardObject = Freehand | Text | Shape;

export interface Viewport {
  x: number; // translação em pixels de tela
  y: number;
  zoom: number;
}

export const STROKE_PX: Record<Size, number> = { s: 2, m: 4, l: 7 };
export interface Box { x: number; y: number; w: number; h: number }

export const TEXT_PX: Record<Size, number> = { s: 20, m: 30, l: 44 };
