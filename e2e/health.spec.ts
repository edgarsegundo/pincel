import { expect, test } from '@playwright/test';
import { circle, rect, stroke, tri, type P } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('keyval-store'); });
  await page.reload();
  await page.waitForSelector('.toolbar');
});

async function sample(page: any, cdp: any) {
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize as number;
  const c = await cdp.send('Memory.getDOMCounters');
  return { heapMB: heap / 1e6, nodes: c.nodes as number, listeners: c.jsEventListeners as number };
}

test('sem vazamento: ciclos de uso completos não aumentam memória, nós nem listeners', async ({ page, context }) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(5000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  const rounds: { heapMB: number; nodes: number; listeners: number }[] = [];

  for (let r = 0; r < 8; r++) {
    // desenhar (com conversão), escrever, rótulo, selecionar/mover/apagar, desfazer, painéis, exportar
    await stroke(page, circle(300, 250, 70));
    await stroke(page, rect(500, 200, 200, 120));
    await stroke(page, tri(800, 200, 160, 140));
    await stroke(page, Array.from({ length: 20 }, (_, i) => [300 + i * 10, 450] as P));
    await page.mouse.move(600, 260);
    await page.keyboard.type('x');
    await page.keyboard.press('Escape');
    await page.mouse.click(300, 180); // seleciona
    await page.mouse.move(300, 180);
    await page.mouse.down();
    await page.mouse.move(340, 220, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.press('Delete');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
    await page.getByTitle('Configurações').click();
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0); // Esc fecha o painel
    await page.getByTitle('Arquivo').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByText('Exportar JSON').click()]);
    await dl.path();
    await page.waitForTimeout(450);
    // zera o que é retenção intencional (quadro e histórico) para medir só o que sobra
    await page.evaluate(() => { (window as any).__pincel.store.setState({ objects: [], past: [], future: [], selection: [], toast: null }); });
    await page.waitForTimeout(100);
    rounds.push(await sample(page, cdp));
  }
  console.log('LEAK rounds', JSON.stringify(rounds.map((r) => ({ heap: +r.heapMB.toFixed(2), nodes: r.nodes, listeners: r.listeners }))));
  const first = rounds[1]!, last = rounds.at(-1)!;
  expect(last.heapMB - first.heapMB).toBeLessThan(1.5); // tolerância de 1,5 MB em 6 ciclos
  expect(last.nodes).toBeLessThanOrEqual(first.nodes + 5);
  expect(last.listeners).toBeLessThanOrEqual(first.listeners + 5);
});

test('ocioso de verdade: nenhum frame de renderização quando nada acontece', async ({ page }) => {
  await stroke(page, circle(400, 300, 80));
  await page.waitForTimeout(1500); // deixa animação, cue e autosave terminarem
  const before = await page.evaluate(() => (window as any).__pincel.stats.frames);
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => (window as any).__pincel.stats.frames);
  console.log('IDLE frames em 2 s:', after - before);
  expect(after - before).toBe(0);
});

test('escala: 5.000 objetos — pan, arrasto e hover', async ({ page }) => {
  const hover = async () => {
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) await page.mouse.move(200 + (i % 50) * 10, 300 + (i % 30) * 5);
    return (Date.now() - t0) / 200;
  };
  const baseline = await hover(); // quadro vazio: custo só do Playwright
  const r = await page.evaluate(async () => {
    const { store, renderer, stats, live } = (window as any).__pincel;
    const objs = Array.from({ length: 5000 }, (_, i) => {
      const base = { id: 'p' + i, color: 'blue', size: 'm', seed: i + 1, createdAt: 0 };
      const x = (i % 80) * 60, y = Math.floor(i / 80) * 60;
      if (i % 3 === 0) return { ...base, type: 'freehand', points: Array.from({ length: 40 }, (_, k) => [x + k, y + Math.sin(k / 3) * 10, 0.5]).flat() };
      return i % 3 === 1 ? { ...base, type: 'rectangle', x, y, w: 40, h: 40, fill: 'hachure' } : { ...base, type: 'ellipse', cx: x + 20, cy: y + 20, rx: 20, ry: 20 };
    });
    store.setState({ objects: objs, viewport: { x: 0, y: 0, zoom: 0.25 } });
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    await frame();
    const med = (a: number[]) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)]!;
    const measure = async (prep: () => void) => { const t: number[] = []; for (let i = 0; i < 9; i++) { prep(); renderer.invalidateStatic(); await frame(); t.push(stats.lastStaticMs); } return med(t); };

    const all = await measure(() => {}); // tudo visível, sem arrasto
    store.setState({ viewport: { x: -3000, y: -2000, zoom: 1 } }); await frame();
    const zoomed = await measure(() => {}); // zoom 100%: culling descarta quase tudo
    store.setState({ viewport: { x: 0, y: 0, zoom: 0.25 } }); await frame();
    live.drag = { ids: new Set(['p1']), dx: 10, dy: 10 };
    const dragging = await measure(() => {}); // arrasto: o que o usuário sente ao mover
    live.drag = null;
    const t0 = performance.now(); const j = structuredClone(store.getState().objects); const clone = performance.now() - t0; // proxy do custo do autosave
    return { all, zoomed, dragging, clone, n: j.length };
  });
  console.log('SCALE 5000 (ms) redesenho tudo:', r.all.toFixed(1), '· zoom 100%:', r.zoomed.toFixed(1), '· arrastando:', r.dragging.toFixed(1), '· structuredClone (autosave):', r.clone.toFixed(1));
  expect(r.all).toBeLessThan(16);
  expect(r.dragging).toBeLessThan(16);

  const loaded = await hover();
  console.log('SCALE hover ms/movimento: vazio', baseline.toFixed(2), '· 5.000 objetos', loaded.toFixed(2), '· custo do app ≈', (loaded - baseline).toFixed(2));
  expect(loaded - baseline).toBeLessThan(4);
});

test('traço muito longo: o custo não cresce com o tamanho do traço', async ({ page }) => {
  test.setTimeout(240_000);
  await page.evaluate(() => { (window as any).__pincel.stats.maxActiveMs = 0; });
  await page.mouse.move(100, 400);
  await page.mouse.down();
  const chunk = async (from: number, to: number) => {
    const t0 = Date.now();
    for (let i = from; i < to; i++) await page.mouse.move(100 + (i % 1000) * 1.1, 400 + Math.sin(i / 8) * 80 + Math.sin(i / 60) * 120);
    return (Date.now() - t0) / (to - from);
  };
  const early = await chunk(0, 300);
  await chunk(300, 1500);
  const late = await chunk(1500, 1800);
  const maxActive = await page.evaluate(() => (window as any).__pincel.stats.maxActiveMs);
  await page.mouse.up();
  console.log('LONG STROKE ms/movimento início', early.toFixed(2), '· após 1.500 pontos', late.toFixed(2), '· maior frame da camada ativa', maxActive.toFixed(2));
  expect(maxActive).toBeLessThan(12);
  expect(late).toBeLessThan(early * 3 + 3);
});
