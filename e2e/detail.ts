import type { Page } from '@playwright/test';

/**
 * 詳細（`DetailSheet`）の三点リーダーから操作を選ぶ。
 * 削除のような操作は表に出さずここに集めてあるので、テストも同じ道をたどる。
 */
export async function detailAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'その他の操作' }).click();
  await page.getByRole('menuitem', { name }).click();
}
