import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { store } from '../core/store';
import { refocusCapture } from '../input/text-capture';
import { t, type Key } from '../i18n';
import { calibrate, countByLabel, MIN_NONE, MIN_PER_SHAPE, type Evaluation, type TrainingStroke } from '../recognition/calibration';
import { applyCalibration, isCalibrated, resetCalibration } from '../recognition/calibration-store';
import { resetLearning } from '../recognition/learning';
import { clearTraining, LABELS, loadTraining, MAX_STROKES, parse, saveTraining, toExport } from './training-data';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Stats({ title, ev }: { title: string; ev: Evaluation }) {
  return (
    <div class="tr-stats">
      <strong>{title}</strong>
      <span>{t('training.recall')}: {pct(ev.recall)}</span>
      <span>{t('training.fp')}: {pct(ev.falsePositive)}</span>
      <span>{t('training.wrong')}: {pct(ev.wrongType)}</span>
    </div>
  );
}

export default function TrainingSheet() {
  const dlg = useRef<HTMLDialogElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const [label, setLabel] = useState<string>('rectangle');
  const [strokes, setStrokes] = useState<TrainingStroke[]>([]);
  const [calibrated, setCalibrated] = useState(isCalibrated());
  const [error, setError] = useState(false);
  const live = useRef<number[] | null>(null);
  const data = useRef<TrainingStroke[]>([]);
  const redraw = useRef<() => void>(() => {});

  const commit = (next: TrainingStroke[]) => {
    data.current = next;
    setStrokes(next);
    redraw.current();
  };

  // Persistência com debounce: um traço por vez não deve escrever no IndexedDB a cada ponto.
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(() => saveTraining(strokes), 400);
    return () => clearTimeout(id);
  }, [strokes]);

  useEffect(() => {
    dlg.current!.showModal();
    let alive = true;
    loadTraining().then((s) => { if (alive) { loaded.current = true; commit(s); } });

    const c = cvs.current!;
    const ctx = c.getContext('2d')!;
    const draw = () => {
      const dpr = devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
      ctx.strokeStyle = getComputedStyle(c).color;
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const paint = (pts: number[], alpha: number) => {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 3) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i]!, pts[i + 1]!);
        ctx.stroke();
      };
      for (const s of data.current.slice(-12)) paint(s.points, 0.25); // só os últimos, como guia visual
      if (live.current) paint(live.current, 1);
      ctx.globalAlpha = 1;
    };
    redraw.current = draw;
    const fit = () => {
      const dpr = devicePixelRatio || 1;
      c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(c.clientHeight * dpr);
      draw();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => { alive = false; ro.disconnect(); redraw.current = () => {}; };
  }, []);

  const counts = useMemo(() => countByLabel(strokes), [strokes]);
  const result = useMemo(() => calibrate(strokes), [strokes]);

  const onDown = (e: PointerEvent) => {
    cvs.current!.setPointerCapture(e.pointerId);
    live.current = [e.offsetX, e.offsetY, 0.5];
  };
  const onMove = (e: PointerEvent) => {
    if (!live.current) return;
    live.current.push(e.offsetX, e.offsetY, 0.5);
    redraw.current();
  };
  const onUp = () => {
    const pts = live.current;
    live.current = null;
    if (pts && pts.length >= 9 && data.current.length < MAX_STROKES) commit([...data.current, { label, points: pts.map((v) => Math.round(v * 10) / 10) }]);
    else redraw.current();
  };

  const close = () => { store.setState({ trainingOpen: false }); setTimeout(refocusCapture, 0); };

  const exportJson = () => {
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([JSON.stringify(toExport(strokes))], { type: 'application/json' }));
    a.href = url; a.download = `pincel-treino-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importJson = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const added = parse(JSON.parse(await file.text()));
      setError(false);
      commit([...data.current, ...added].slice(0, MAX_STROKES));
    } catch { setError(true); }
  };
  const activate = () => { applyCalibration(result.thresholds); resetLearning(); setCalibrated(true); };
  const reset = () => { resetCalibration(); resetLearning(); setCalibrated(false); };
  const clearAll = () => { clearTraining(); commit([]); };

  return (
    <dialog ref={dlg} class="training" onClose={close} onKeyDown={(e) => e.stopPropagation()}>
      <header>
        <span>{t('training.title')}</span>
        <button class="btn" aria-label={t('training.close')} onClick={close}>✕</button>
      </header>
      <p class="tr-intro">{t('training.intro')}</p>
      <div class="tr-labels" role="radiogroup" aria-label={t('training.draw')}>
        {LABELS.map((l) => (
          <button class="chip" role="radio" aria-checked={l === label} onClick={() => setLabel(l)}>
            {t(`label.${l}` as Key)} <b>{counts[l] ?? 0}</b>
            <small>{l === 'none' ? ` ${t('training.min')} ${MIN_NONE}` : ` ${t('training.min')} ${MIN_PER_SHAPE}`}</small>
          </button>
        ))}
      </div>
      <div class="tr-canvas">
        {strokes.length === 0 && <span class="tr-hint">{t('training.canvasHint')}</span>}
        <canvas ref={cvs} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>
      <footer>
        {result.reason && <p class="tr-warn">{t(`training.${result.reason}` as Key)}</p>}
        {result.ready && (
          <div class="tr-compare"><Stats title={t('training.now')} ev={result.before} /><Stats title={t('training.after')} ev={result.after} /></div>
        )}
        <div class="tr-actions">
          <button class="primary" disabled={!result.ready} onClick={activate}>{t('training.activate')}</button>
          <button class="link" disabled={!calibrated} onClick={reset}>{t('training.reset')}</button>
          <span class="tr-status">{calibrated ? t('training.statusOn') : t('training.statusOff')}</span>
        </div>
        <div class="tr-actions">
          <button class="link" disabled={strokes.length === 0} onClick={() => commit(strokes.slice(0, -1))}>{t('training.undo')}</button>
          <button class="link" disabled={strokes.length === 0} onClick={clearAll}>{t('training.clear')}</button>
          <button class="link" disabled={strokes.length === 0} onClick={exportJson}>{t('training.export')}</button>
          <label class="link">{t('training.import')}<input type="file" accept="application/json,.json" hidden onChange={importJson} /></label>
          {error && <span class="tr-warn">{t('training.importError')}</span>}
        </div>
      </footer>
    </dialog>
  );
}
