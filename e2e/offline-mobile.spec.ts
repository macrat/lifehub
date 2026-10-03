import { devices, expect, test } from '@playwright/test';
import { openHome } from './auth.ts';
import { OFFLINE_MESSAGE, offlineIndicator } from './layout.ts';

test.use({ ...devices['Pixel 7'] });

test('オフラインの印を短くタップすると説明が出る', async ({ page, context }) => {
  await openHome(page);
  await context.setOffline(true);
  await offlineIndicator(page).tap();
  await expect(page.getByRole('tooltip')).toHaveText(OFFLINE_MESSAGE);
});
