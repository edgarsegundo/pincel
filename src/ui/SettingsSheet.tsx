import { useEffect, useRef } from 'preact/hooks';
import { useSyncExternalStore } from 'preact/compat';
import { store } from '../core/store';
import { refocusCapture } from '../input/text-capture';
import { t, type Key } from '../i18n';
import { schema, type Field } from '../settings/schema';
import { resetSettings, setSetting, settings } from '../settings/settings';

function Row({ f }: { f: Field }) {
  const v = settings.getState()[f.key] as any;
  const set = (x: unknown) => setSetting(f.key, x as never);
  return (
    <label class="row">
      <span>{t(`field.${f.key}` as Key)}</span>
      {f.kind === 'toggle' && <input type="checkbox" checked={v} onChange={(e) => set(e.currentTarget.checked)} />}
      {f.kind === 'select' && (
        <select value={v} onChange={(e) => set(e.currentTarget.value)}>
          {f.options.map((o) => <option value={o}>{t(`opt.${o}` as Key)}</option>)}
        </select>
      )}
      {f.kind === 'range' && (
        <>
          <input type="range" min={f.min} max={f.max} step={f.step} value={v} onInput={(e) => set(Number(e.currentTarget.value))} />
          <span class="val">{f.step < 1 ? v.toFixed(2).replace(/\.?0+$/, '') : v}</span>
        </>
      )}
    </label>
  );
}

export function SettingsSheet() {
  const ref = useRef<HTMLDialogElement>(null);
  const open = useSyncExternalStore(store.subscribe, () => store.getState().settingsOpen);
  useSyncExternalStore(settings.subscribe, () => settings.getState()); // re-render ao mudar

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => { store.setState({ settingsOpen: false }); setTimeout(refocusCapture, 0); };
  return (
    <dialog ref={ref} class="sheet" onClose={close} onClick={(e) => e.target === ref.current && close()}>
      <header>
        <span>{t('settings.title')}</span>
        <button class="btn" aria-label={t('settings.close')} onClick={close}>✕</button>
      </header>
      <div class="body">
        {schema.filter((f) => f.group === 'basic').map((f) => <Row f={f} />)}
        <details>
          <summary>{t('settings.advanced')}</summary>
          {schema.filter((f) => f.group === 'advanced').map((f) => <Row f={f} />)}
          <button class="link" onClick={() => store.setState({ settingsOpen: false, trainingOpen: true })}>{t('training.link')}</button>
        </details>
        <button class="link" onClick={resetSettings}>{t('settings.reset')}</button>
      </div>
    </dialog>
  );
}
