import { expect, test } from '@playwright/test';

test('abre e desenha sem internet depois da primeira visita', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // garante que o service worker controla a página
  await page.waitForSelector('.toolbar');

  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.toolbar');
  await expect(page.locator('.hint')).toBeVisible();

  await page.mouse.move(300, 300);
  await page.mouse.down();
  for (let i = 1; i < 30; i++) await page.mouse.move(300 + i * 8, 300 + Math.sin(i / 3) * 50);
  await page.mouse.up();
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('Pincel');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
});
