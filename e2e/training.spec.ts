import { expect, test } from '@playwright/test';
import { rect, stroke, type P } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('keyval-store'); });
  await page.reload();
  await page.waitForSelector('.toolbar');
});

const open = async (page: any) => {
  await page.getByTitle('Configurações').click();
  await page.getByText('Avançado').click();
  await page.getByRole('button', { name: /Treinar o reconhecimento/ }).click();
  await expect(page.locator('dialog.training')).toBeVisible();
};

// o traço do treino não passa pelo reconhecedor: desenhar no canvas só grava o exemplo
const draw = async (page: any, pts: P[]) => {
  await page.mouse.move(pts[0]![0], pts[0]![1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y);
  await page.mouse.up();
};
const scribble = (i: number): P[] => Array.from({ length: 30 }, (_, k) => [300 + i * 6 + Math.sin(k * 0.9 + i) * 40, 300 + k * 4 + Math.cos(k * 0.7) * 25] as P);

test('treinamento: exige exemplos de "não é forma", calibra, persiste e volta ao padrão', async ({ page }) => {
  await open(page);
  const activate = page.getByRole('button', { name: 'Ativar calibração' });
  await expect(activate).toBeDisabled();

  await page.getByRole('radio', { name: /Retângulo/ }).click();
  for (let i = 0; i < 6; i++) await draw(page, rect(250 + i * 3, 250, 220, 140));
  await expect(page.getByText(/pelo menos 20 traços de “Não é forma”/)).toBeVisible();
  await expect(activate).toBeDisabled(); // sem "none" a calibração não é liberada

  await page.getByRole('radio', { name: /Não é forma/ }).click();
  for (let i = 0; i < 20; i++) await draw(page, scribble(i));
  await expect(activate).toBeEnabled();
  await expect(page.getByText('Com a calibração')).toBeVisible();

  await activate.click();
  await expect(page.getByText('Calibração ativa neste aparelho')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pincel.calibration') ?? '{}'))).toHaveProperty('rectangle');

  // os traços sobrevivem a um reload (IndexedDB)
  await page.waitForTimeout(700);
  await page.reload();
  await page.waitForSelector('.toolbar');
  await open(page);
  await expect(page.getByRole('radio', { name: /Não é forma/ })).toContainText('20');
  await expect(page.getByText('Calibração ativa neste aparelho')).toBeVisible();

  await page.getByRole('button', { name: 'Voltar ao padrão' }).click();
  await expect(page.getByText('Usando os limiares padrão')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pincel.calibration'))).toBe('{}');

  // fechar devolve o quadro ao uso normal e nada foi desenhado nele
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.training')).toHaveCount(0);
  await stroke(page, rect(300, 200, 200, 120));
  expect(await page.evaluate(() => (window as any).__pincel.store.getState().objects.length)).toBe(1);
});
