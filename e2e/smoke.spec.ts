import { expect, test } from '@playwright/test';

test('トップページが表示され、API が DB に接続できる', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hello' })).toBeVisible();

  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true, db: true });
});
