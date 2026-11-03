import { addObject, commit, store } from '../core/store';
import { rid } from '../core/ids';
import { TEXT_PX, type Shape, type Text, type Vec2, type WhiteboardObject } from '../core/types';
import { canLabel, closedContaining, labelBoxOf } from '../shapes';
import { live } from '../render/renderer';
import { LINE_HEIGHT, textFont } from '../shapes/text';
import { screenToBoard } from '../viewport/viewport';

/**
 * Um <textarea> sempre focado captura o teclado quando não há edição. No primeiro
 * `input`/`compositionstart` ele vira o editor visível, já com o caractere digitado
 * (acentos, teclas mortas e IME funcionam desde o primeiro caractere).
 */
interface Session { existing: Text | null; labelOf: Shape | null; x: number; y: number; color: Text['color']; size: Text['size'] }

let ta: HTMLTextAreaElement;
let session: Session | null = null;
let last: Vec2 | null = null; // última posição do ponteiro, em pixels de tela
let renderer: { invalidateStatic(): void };

/** Devolve o foco ao campo de captura (ex.: depois de fechar um painel). */
export const refocusCapture = () => ta?.focus({ preventScroll: true });

export const isEditing = () => session !== null;
/** Teclado pertence a outra coisa (edição de texto ou painel aberto). */
export const blocked = () => session !== null || !!document.querySelector('dialog[open]');

function layout() {
  if (!session) return;
  const { viewport: v } = store.getState();
  const px = TEXT_PX[session.size] * v.zoom;
  ta.style.left = `${session.x * v.zoom + v.x}px`;
  ta.style.top = `${session.y * v.zoom + v.y}px`;
  ta.style.fontSize = `${px}px`;
  ta.style.color = `var(--draw-${session.color})`;
  ta.style.height = '1px';
  if (session.labelOf) { // rótulo: centralizado na área da forma, quebrando linha na largura dela
    const box = labelBoxOf(session.labelOf);
    ta.style.textAlign = 'center';
    ta.style.whiteSpace = 'pre-wrap';
    ta.style.left = `${box.x * v.zoom + v.x}px`;
    ta.style.width = `${box.w * v.zoom}px`;
    const h = Math.max(ta.scrollHeight, px * LINE_HEIGHT);
    ta.style.height = `${h}px`;
    ta.style.top = `${(box.y + box.h / 2) * v.zoom + v.y - h / 2}px`;
    return;
  }
  ta.style.width = '1px';
  ta.style.width = `${ta.scrollWidth + 6}px`;
  ta.style.height = `${Math.max(ta.scrollHeight, px * LINE_HEIGHT)}px`;
}

function begin(s: Session, value?: string) {
  session = s;
  if (value !== undefined) ta.value = value;
  live.editingId = s.existing?.id ?? null;
  live.editingLabelId = s.labelOf?.id ?? null;
  ta.setAttribute('wrap', s.labelOf ? 'soft' : 'off');
  ta.classList.add('editing');
  layout();
  ta.focus({ preventScroll: true });
  if (s.existing || s.labelOf) ta.setSelectionRange(ta.value.length, ta.value.length);
  renderer.invalidateStatic();
}

function finish() {
  const s = session;
  if (!s) return;
  session = null;
  const value = ta.value.replace(/\s+$/, '');
  if (s.labelOf) {
    const id = s.labelOf.id;
    const cur = store.getState().objects.find((o) => o.id === id) as (Shape & { label?: { text: string } }) | undefined;
    if (cur && (cur.label?.text ?? '') !== value) {
      const next = { ...cur, label: value ? { text: value } : undefined };
      if (!value) delete next.label;
      commit(store.getState().objects.map((o) => (o.id === id ? (next as WhiteboardObject) : o)));
    }
  } else if (s.existing) {
    const id = s.existing.id;
    if (!value) commit(store.getState().objects.filter((o) => o.id !== id));
    else if (value !== s.existing.text) commit(store.getState().objects.map((o) => (o.id === id ? { ...(o as Text), text: value } : o)));
  } else if (value) {
    addObject({ id: rid(), type: 'text', color: s.color, size: s.size, seed: 0, createdAt: Date.now(), x: s.x, y: s.y, text: value });
  }
  live.editingId = null;
  live.editingLabelId = null;
  renderer.invalidateStatic();
  // Recria o campo: o navegador guarda o histórico interno de desfazer de cada <textarea>
  // (com os nós dos textos já digitados), o que vazaria memória a cada texto escrito.
  const old = ta;
  mount();
  old.remove();
  settleFocus();
}

const defaultPoint = (): Vec2 => {
  const { viewport: v } = store.getState();
  const [sx, sy] = last ?? [window.innerWidth / 2, window.innerHeight / 2];
  return screenToBoard(v, sx, sy);
};

export function startNewAt(p: Vec2) {
  const { color, size } = store.getState();
  begin({ existing: null, labelOf: null, x: p[0], y: p[1] - (TEXT_PX[size] * LINE_HEIGHT) / 2, color, size }, '');
}

export function startEdit(o: Text) {
  begin({ existing: o, labelOf: null, x: o.x, y: o.y, color: o.color, size: o.size }, o.text);
}

export function startEditLabel(o: Shape) {
  const text = (o as { label?: { text: string } }).label?.text ?? '';
  begin({ existing: null, labelOf: o, x: 0, y: 0, color: o.color, size: o.size }, text);
}

function startFromTyping() {
  if (session) return;
  const p = defaultPoint();
  const st = store.getState();
  const one = st.selection.length === 1 ? st.objects.find((o) => o.id === st.selection[0]) : undefined;
  const target = one && canLabel(one) ? one : closedContaining(st.objects, p);
  if (target) { // digitar sobre uma forma fechada (ou com ela selecionada) cria o rótulo dela
    const text = (target as { label?: { text: string } }).label?.text;
    begin({ existing: null, labelOf: target as Shape, x: 0, y: 0, color: target.color, size: target.size }, text ? text + ta.value : undefined);
    return;
  }
  const { color, size } = st;
  begin({ existing: null, labelOf: null, x: p[0], y: p[1] - (TEXT_PX[size] * LINE_HEIGHT) / 2, color, size });
}

/** Devolve o foco ao campo de captura, a menos que outro controle (painel, input) o esteja usando. */
function settleFocus() {
  setTimeout(() => {
    const a = document.activeElement;
    const other = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
    if (!session && !other && !document.querySelector('dialog[open]')) ta.focus({ preventScroll: true });
  }, 0);
}

function mount() {
  const el = document.createElement('textarea');
  el.className = 'capture';
  el.setAttribute('wrap', 'off');
  el.setAttribute('aria-label', 'Texto');
  el.spellcheck = false;
  el.addEventListener('compositionstart', startFromTyping);
  el.addEventListener('input', () => { startFromTyping(); layout(); });
  el.addEventListener('keydown', (e) => {
    if (session && e.code === 'Escape') { e.preventDefault(); finish(); }
    if (!session && e.code === 'Enter') e.preventDefault();
  });
  el.addEventListener('blur', () => {
    if (el !== ta) return; // campo já substituído
    finish();
    settleFocus();
  });
  document.body.appendChild(el);
  ta = el;
}

export function initTextCapture(r: { invalidateStatic(): void }) {
  renderer = r;
  mount();
  window.addEventListener('pointermove', (e) => { last = [e.clientX, e.clientY]; }, { passive: true });
  store.subscribe((s, prev) => { if (s.viewport !== prev.viewport) layout(); });
  ta.focus({ preventScroll: true });
}
