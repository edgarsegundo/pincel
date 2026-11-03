import { expect, test, type Page } from '@playwright/test';
import { objects, stroke, types, wobblyDiamond, wobblyRect } from './helpers';

type Verdict = { shape: string; confidence: number; deliberate: number };
const verdict = (over: Partial<Verdict> = {}) => ({ shape: 'rectangle', confidence: 0.92, deliberate: 0.9, probabilities: { circle: 0.02, triangle: 0.02, rectangle: 0.92, diamond: 0.02, none: 0.02 }, model: 'jev-test', ...over });

/** Intercepta o proxy: nenhuma chave real é usada nos testes. */
async function mockProxy(page: Page, opts: { reply?: () => Verdict | { status: number }; delayMs?: number } = {}) {
  const calls: any[] = [];
  await page.route('**/api/shape', async (route) => {
    calls.push(JSON.parse(route.request().postData() ?? '{}'));
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    const r = opts.reply?.() ?? verdict();
    if ('status' in r) return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify({ error: 'x' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
  });
  return calls;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('keyval-store'); });
  await page.reload();
  await page.waitForSelector('.toolbar');
});

test('traço ambíguo: o local deixa livre, a IA decide em segundo plano e o desfazer restaura', async ({ page }) => {
  const calls = await mockProxy(page);
  await stroke(page, wobblyRect(300, 250, 220, 140));
  await expect.poll(() => types(page)).toEqual(['rectangle']);
  expect(calls).toHaveLength(1);
  expect(calls[0].v).toBe(1);
  expect(calls[0].features.corner_count).toBe(4); // características, não coordenadas brutas
  expect(calls[0].outline.length).toBeLessThanOrEqual(16);
  expect((await objects(page))[0].recognizedFrom.source).toBe('ai');

  await page.keyboard.press('Control+z'); // restaura o traço original
  expect(await types(page)).toEqual(['freehand']);
});

test('losango torto: a IA decide "diamond" e o app desenha o losango com a geometria local', async ({ page }) => {
  const calls = await mockProxy(page, { reply: () => verdict({ shape: 'diamond' }) });
  await stroke(page, wobblyDiamond(420, 320, 240, 160));
  await expect.poll(() => types(page)).toEqual(['diamond']);
  expect(calls).toHaveLength(1);
  expect((await objects(page))[0].recognizedFrom.source).toBe('ai');
});

test('confiança baixa, "pouca intenção" ou "none": o traço continua livre', async ({ page }) => {
  for (const reply of [() => verdict({ confidence: 0.4 }), () => verdict({ deliberate: 0.2 }), () => verdict({ shape: 'none' })]) {
    await page.unroute('**/api/shape').catch(() => {});
    const calls = await mockProxy(page, { reply });
    await page.evaluate(() => (window as any).__pincel.store.setState({ objects: [], past: [], future: [] }));
    await page.waitForTimeout(700); // passa da janela de cadência de escrita
    await stroke(page, wobblyRect(300, 250, 220, 140));
    await page.waitForTimeout(300);
    expect(calls).toHaveLength(1); // a IA foi consultada e a resposta é que foi recusada
    expect(await types(page)).toEqual(['freehand']);
  }
});

test('a IA não força: "círculo" para um retângulo nítido é recusado pelo encaixe local', async ({ page }) => {
  const calls = await mockProxy(page, { reply: () => verdict({ shape: 'circle' }) });
  await stroke(page, wobblyRect(300, 250, 260, 120));
  await page.waitForTimeout(400);
  expect(calls).toHaveLength(1);
  expect(await types(page)).toEqual(['freehand']);
});

test('resposta atrasada é descartada se o traço foi apagado ou desfeito', async ({ page }) => {
  await mockProxy(page, { delayMs: 700 });
  await stroke(page, wobblyRect(300, 250, 220, 140));
  await page.keyboard.press('Control+z'); // desfaz o traço antes da resposta
  await page.waitForTimeout(1100);
  expect(await types(page)).toEqual([]);
});

test('indicador "analisando" aparece só quando demora e some ao responder', async ({ page }) => {
  await mockProxy(page, { delayMs: 900 });
  await stroke(page, wobblyRect(300, 250, 220, 140));
  expect(await page.evaluate(() => (window as any).__pincel.ai.pending.size)).toBe(1);
  await expect.poll(() => types(page), { timeout: 3000 }).toEqual(['rectangle']);
  expect(await page.evaluate(() => (window as any).__pincel.ai.pending.size)).toBe(0);
});

test('segurar parado: quando o local não reconhece, a IA decide e o arrasto ajusta o tamanho', async ({ page }) => {
  const calls = await mockProxy(page);
  const pts = wobblyRect(300, 250, 200, 120, 9); // tremor grande: nem segurando o local reconhece
  const last = pts.at(-1)!;
  await stroke(page, pts, { holdMs: 900, endPts: [[last[0] - 80, last[1] - 60]] });
  expect(calls.length).toBeGreaterThanOrEqual(1);
  const o = (await objects(page)).at(-1);
  expect(o.type).toBe('rectangle');
  expect(o.recognizedFrom.source).toBe('ai');
  expect(o.recognizedFrom.trigger).toBe('hold');
  expect(o.w).toBeGreaterThan(240); // cresceu além dos ~200 originais
});

test('proxy sem chave (503): a IA desliga na sessão e para de enviar', async ({ page }) => {
  const calls = await mockProxy(page, { reply: () => ({ status: 503 }) });
  await stroke(page, wobblyRect(300, 250, 220, 140));
  await page.waitForTimeout(500);
  await page.waitForTimeout(700);
  await stroke(page, wobblyRect(300, 450, 220, 140));
  await page.waitForTimeout(500);
  expect(calls).toHaveLength(1);
  expect(await types(page)).toEqual(['freehand', 'freehand']); // o desenho nunca é afetado
});

test('falhas de rede repetidas: disjuntor pausa a IA e o desenho segue normal', async ({ page }) => {
  const calls = await mockProxy(page, { reply: () => ({ status: 502 }) });
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(700);
    await stroke(page, wobblyRect(100 + i * 10, 100 + i * 130, 200, 100));
  }
  await page.waitForTimeout(300);
  expect(calls).toHaveLength(3); // 3 falhas seguidas pausam a IA
  expect((await types(page)).length).toBe(5);
});

test('com a ajuda da IA desligada nas configurações, nada é enviado', async ({ page }) => {
  const calls = await mockProxy(page);
  await page.evaluate(() => (window as any).__pincel.settings.setState({ aiAssist: false }));
  await stroke(page, wobblyRect(300, 250, 220, 140));
  await page.waitForTimeout(500);
  expect(calls).toHaveLength(0);
  expect(await types(page)).toEqual(['freehand']);
});

test('letras e traços abertos nunca saem do navegador', async ({ page }) => {
  const calls = await mockProxy(page);
  await stroke(page, Array.from({ length: 30 }, (_, i) => [300 + i * 6, 300 + Math.sin(i / 3) * 40] as [number, number]));
  await page.waitForTimeout(400);
  expect(calls).toHaveLength(0);
});
