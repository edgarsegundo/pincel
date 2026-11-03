import { useRef } from 'preact/hooks';
import { t } from '../i18n';
import { exportJSON, exportPNG, importFile } from '../persistence/export';
import { Download } from './icons';

/** Menu de arquivo usando o popover nativo do navegador (sem biblioteca). */
export function Menu() {
  const pop = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const place = () => {
    const b = btn.current!.getBoundingClientRect();
    const p = pop.current!;
    p.style.left = `${Math.max(8, Math.min(window.innerWidth - 188, b.left + b.width / 2 - 90))}px`;
    p.style.bottom = `${window.innerHeight - b.top + 10}px`;
  };
  const run = (fn: () => void) => () => { pop.current?.hidePopover(); fn(); };

  return (
    <>
      <button ref={btn} class="btn" title={t('menu')} aria-label={t('menu')} onClick={() => { place(); pop.current?.togglePopover(); }}><Download /></button>
      <div ref={pop} popover="auto" class="menu">
        <button onClick={run(exportPNG)}>{t('export.png')}</button>
        <button onClick={run(exportJSON)}>{t('export.json')}</button>
        <button onClick={run(() => file.current?.click())}>{t('import')}</button>
      </div>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => {
        const f = e.currentTarget.files?.[0];
        if (f) importFile(f);
        e.currentTarget.value = '';
      }} />
    </>
  );
}
