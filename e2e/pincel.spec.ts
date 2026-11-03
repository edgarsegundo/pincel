import { expect, test } from '@playwright/test';
import { circle, objects, rect, stroke, tri, types, type P } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('keyval-store'); });
  await page.reload();
  await page.waitForSelector('.toolbar');
});

test('desenha um traço livre', async ({ page }) => {
  const s: P[] = Array.from({ length: 40 }, (_, i) => [300 + i * 8, 300 + Math.sin(i / 3) * 60]);
  await stroke(page, s);
  expect(await types(page)).toEqual(['freehand']);
});

test('círculo vira elipse; Ctrl+Z restaura o traço; Ctrl+Z remove', async ({ page }) => {
  await stroke(page, circle(500, 350, 90));
  expect(await types(page)).toEqual(['ellipse']);
  await page.keyboard.press('Control+z');
  expect(await types(page)).toEqual(['freehand']);
  await page.keyboard.press('Control+z');
  expect(await types(page)).toEqual([]);
});

test('retângulo e triângulo são reconhecidos', async ({ page }) => {
  await stroke(page, rect(200, 200, 220, 140));
  await stroke(page, tri(600, 200, 200, 170));
  expect(await types(page)).toEqual(['rectangle', 'triangle']);
});

test('segurar parado endireita e arrastar ajusta o tamanho', async ({ page }) => {
  // retângulo bem torto: soltando direto não converteria; segurando converte
  const pts = rect(300, 250, 200, 120).map(([x, y], i) => [x + Math.sin(i * 0.5) * 5, y + Math.cos(i * 0.4) * 5] as P);
  // soltando direto, o traço torto fica livre
  await stroke(page, pts);
  expect(await types(page)).toEqual(['freehand']);
  await page.keyboard.press('Control+z');
  await stroke(page, pts, { holdMs: 700, endPts: [[pts.at(-1)![0] - 80, pts.at(-1)![1] - 60]] });
  const o = (await objects(page)).at(-1);
  expect(o.type).toBe('rectangle');
  expect(o.w).toBeGreaterThan(240); // o traço fechou no canto sup. esquerdo (alça): arrastar para fora cresce de ~200 para ~280
});

test('digitar cria texto; digitar sobre forma cria rótulo', async ({ page }) => {
  await page.mouse.move(300, 200);
  await page.keyboard.type('olá');
  await page.keyboard.press('Escape');
  let objs = await objects(page);
  expect(objs.map((o: any) => [o.type, o.text])).toEqual([['text', 'olá']]);

  await stroke(page, rect(500, 300, 240, 160));
  await page.mouse.move(620, 380);
  await page.keyboard.type('Oi');
  await page.keyboard.press('Escape');
  objs = await objects(page);
  expect(objs.find((o: any) => o.type === 'rectangle').label.text).toBe('Oi');
});

test('rabiscar sobre um objeto o apaga', async ({ page }) => {
  await stroke(page, Array.from({ length: 30 }, (_, i) => [300 + i * 10, 300 + Math.sin(i / 2) * 25] as P));
  expect(await types(page)).toEqual(['freehand']);
  const zig: P[] = [];
  for (let i = 0; i < 14; i++) zig.push([330 + i * 14, i % 2 ? 260 : 340]);
  await page.mouse.move(zig[0]![0], zig[0]![1]);
  await page.mouse.down();
  for (const [x, y] of zig) await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await types(page)).toEqual([]);
});

test('linha ligada a uma forma acompanha quando a forma se move', async ({ page }) => {
  await stroke(page, rect(500, 250, 200, 120));
  // linha reta da esquerda até a borda esquerda do retângulo (x=500)
  await stroke(page, Array.from({ length: 24 }, (_, i) => [300 + i * 8.6, 310] as P));
  const objs = await objects(page);
  const line = objs.find((o: any) => o.type === 'line');
  expect(line?.bindings?.to?.objectId).toBe(objs.find((o: any) => o.type === 'rectangle').id);
  const endBefore = line.to;

  // seleciona o retângulo (clique na borda de cima) e arrasta
  await page.mouse.click(600, 250);
  await page.mouse.move(600, 250);
  await page.mouse.down();
  await page.mouse.move(640, 300, { steps: 8 });
  await page.mouse.up();
  const after = (await objects(page)).find((o: any) => o.type === 'line');
  expect(after.to[0]).toBeGreaterThan(endBefore[0] + 30);
});

test('Desfazer da notificação de limpar não atinge um traço novo', async ({ page }) => {
  await stroke(page, circle(400, 300, 80));
  await page.getByTitle('Limpar quadro').click();
  await expect(page.locator('.toast')).toBeVisible();
  await page.waitForTimeout(700); // passa da janela de "cadência de escrita" (600 ms)
  await stroke(page, rect(300, 250, 200, 120));
  await expect(page.locator('.toast')).toHaveCount(0);
  expect(await types(page)).toEqual(['rectangle']);
});

test('o quadro persiste ao recarregar', async ({ page }) => {
  await stroke(page, circle(400, 300, 80));
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.reload();
  await page.waitForSelector('.toolbar');
  await page.waitForTimeout(300);
  expect(await types(page)).toEqual(['ellipse']);
});

test('exporta e importa JSON; arquivo inválido não altera o quadro', async ({ page }) => {
  await stroke(page, rect(300, 250, 200, 120));
  await page.getByTitle('Arquivo').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByText('Exportar JSON').click()]);
  const path = await dl.path();
  const fs = await import('node:fs');
  const saved = JSON.parse(fs.readFileSync(path!, 'utf8'));
  expect(saved.version).toBe(1);
  expect(saved.objects).toHaveLength(1);

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await types(page)).toEqual([]);

  await page.locator('input[type=file]').setInputFiles({ name: 'q.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await page.waitForTimeout(300);
  expect(await types(page)).toEqual(['rectangle']);

  await page.locator('input[type=file]').setInputFiles({ name: 'ruim.json', mimeType: 'application/json', buffer: Buffer.from('nao é json') });
  await page.waitForTimeout(300);
  expect(await types(page)).toEqual(['rectangle']);
  await expect(page.locator('.toast')).toContainText('inválido');
});

test('exporta PNG', async ({ page }) => {
  await stroke(page, circle(400, 300, 80));
  await page.getByTitle('Arquivo').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByText('Exportar PNG').click()]);
  expect(dl.suggestedFilename()).toMatch(/\.png$/);
});

test('painel de configurações abre, muda o idioma e persiste', async ({ page }) => {
  await page.getByTitle('Configurações').click();
  await page.locator('.sheet select').first().selectOption('en');
  await expect(page.locator('.sheet header span')).toHaveText('Settings');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForSelector('.toolbar');
  await expect(page.locator('.hint')).toContainText('Draw anything');
});

test('desempenho: 1.000 formas desenhadas à mão redesenham rápido', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { store, renderer, stats } = (window as any).__pincel;
    const objs = Array.from({ length: 1000 }, (_, i) => {
      const base = { id: 'p' + i, color: 'blue', size: 'm', seed: i + 1, createdAt: 0 };
      const x = (i % 40) * 60, y = Math.floor(i / 40) * 60;
      return i % 2 ? { ...base, type: 'rectangle', x, y, w: 40, h: 40, fill: 'hachure' } : { ...base, type: 'ellipse', cx: x + 20, cy: y + 20, rx: 20, ry: 20 };
    });
    store.setState({ objects: objs, viewport: { x: 0, y: 0, zoom: 0.4 } });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // 1º desenho (gera os caminhos)
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      renderer.invalidateStatic();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      times.push(stats.lastStaticMs);
    }
    const mem = (performance as any).memory?.usedJSHeapSize ?? 0;
    return { median: times.sort((a, b) => a - b)[5], mem };
  });
  console.log('PERF redesenho estático 1000 formas (ms):', result.median.toFixed(2), '· heap MB:', (result.mem / 1e6).toFixed(1));
  expect(result.median).toBeLessThan(8);
});

test('apagar uma forma desenhada à mão faz fade (não some de uma vez)', async ({ page }) => {
  await stroke(page, rect(400, 250, 220, 140));
  expect(await types(page)).toEqual(['rectangle']);
  await page.mouse.click(510, 250); // seleciona pela borda de cima
  const samples = page.evaluate(async () => {
    const c = document.getElementById('layer-active') as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const out: number[] = [];
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let max = 0;
      for (let k = 3; k < d.length; k += 4) if (d[k]! > max) max = d[k]!;
      out.push(max);
    }
    return out;
  });
  await page.keyboard.press('Delete');
  const s = await samples;
  console.log('FADE alfa máximo por frame:', s.join(','));
  expect(await types(page)).toEqual([]);
  expect(s.some((v) => v > 0 && v < 245)).toBe(true); // frames intermediários: semitransparente
});

test('trocar o idioma atualiza também a barra de contexto', async ({ page }) => {
  await stroke(page, rect(400, 250, 220, 140));
  await page.mouse.click(510, 250);
  await expect(page.locator('.ctxbar [title="Duplicar (⌘D)"]')).toHaveCount(1);
  await page.evaluate(() => (window as any).__pincel.settings.setState({ language: 'en' }));
  await expect(page.locator('.ctxbar [title="Duplicate (⌘D)"]')).toHaveCount(1);
});
