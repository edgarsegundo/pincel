// Ícones no estilo Lucide (ISC), só os usados.
const I = (d: string) => () => <svg viewBox="0 0 24 24"><path d={d} /></svg>;
export const Undo = I('M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3');
export const Redo = I('m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3');
export const Trash = I('M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14');
export const Sun = I('M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z');
export const Moon = I('M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z');
export const Wand = I('M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5');
export const Gear = I('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z');
export const Copy = I('M9 9h11v11H9zM5 15V4h11');
export const Pencil = I('M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z');
export const Square = I('M4 4h16v16H4z');
export const FillSolid = () => <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" fill-opacity=".35" /></svg>;
export const FillHachure = () => <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12 12 4M4 20 20 4M12 20 20 12" /></svg>;
export const FillNone = () => <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>;
export const Arrow = I('M5 12h14M13 6l6 6-6 6');
export const ArrowBoth = I('M5 12h14M11 6l-6 6 6 6M13 6l6 6-6 6');
export const Minus = I('M5 12h14');
export const Download = I('M12 3v12M7 10l5 5 5-5M5 21h14');
