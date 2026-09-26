import { expect, test } from '@playwright/test';
import { HOLIDAY } from './global-setup.ts';

test('祝日の日付は日曜と同じ色で出る', async ({ page }) => {
  await page.goto(`/calendar?view=month&date=${HOLIDAY}`);
  // 前後の月の面にも同じ日があるので、見えている面（ボタンとして読める方）で探す
  const dayNumber = (label: string) =>
    page.getByRole('button', { name: label }).locator('.MuiTypography-root');
  // 祝日（月曜）の前日が日曜、翌日が平日の火曜
  const sunday = await dayNumber('2030年05月05日（日）').evaluate(
    (el) => getComputedStyle(el).color,
  );
  const weekday = await dayNumber('2030年05月07日（火）').evaluate(
    (el) => getComputedStyle(el).color,
  );
  expect(sunday).not.toBe(weekday);
  await expect(dayNumber('2030年05月06日（月）')).toHaveCSS('color', sunday);
});
