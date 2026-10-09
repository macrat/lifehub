import { myId } from './auth.ts';
import { expect, test } from './test.ts';
import { E2E_USER } from './users.ts';

test('ユーザーの編集画面にユーザー ID が出て、押すとコピーできる', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const id = await myId(page);

  await page.goto('/admin/users');
  await page.getByRole('button', { name: `${E2E_USER.name} を編集` }).click();
  const field = page.getByLabel('ユーザー ID', { exact: true });
  await expect(field).toHaveValue(id);
  await expect(field).not.toBeEditable();

  await field.click();
  await expect(page.getByText('ユーザー ID をコピーしました')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(id);

  // 右のボタン（キーボードや読み上げの入口）からも同じくコピーできる
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await page.getByRole('button', { name: 'ユーザー ID をコピー' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(id);
});

/**
 * パスワードの変更とユーザーの登録は、今のパスワードが違えばシートに理由を出して何も変えない。
 * 通るときの動き（変わる・全端末のセッションが切れる・登録される）はサーバーのテスト
 * （`server/__tests__/user-authorization.test.ts`）が確かめる。E2E のユーザーと DB はワーカーの中で
 * 使い回すので、ここで変えると後のテストがログインできなくなる・参加者が増える。
 */
test('今のパスワードが違うと、パスワードの変更もユーザーの登録もできない', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /パスワードを変更/ }).click();
  const passwordSheet = page.getByRole('dialog', { name: 'パスワードを変更' });
  await page.getByLabel('今のパスワード').fill('wrong-password-123');
  await page.getByLabel('新しいパスワード').fill('new-password-1234');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(passwordSheet.getByText('今のパスワードが違います')).toBeVisible();
  await page.getByRole('button', { name: '閉じる' }).click();
  // ログインしたまま（セッションは切れていない）
  await page.goto('/admin/users');
  await expect(page).toHaveURL('/admin/users');

  await page.getByRole('button', { name: 'ユーザーを登録' }).click();
  const sheet = page.getByRole('dialog', { name: 'ユーザーを登録' });
  await page.getByLabel('名前').fill('だれか');
  await page.getByLabel('メールアドレス').fill('someone@example.com');
  await page.getByLabel('パスワード', { exact: true }).fill('someone-password-1');
  await page.getByLabel('あなたの今のパスワード').fill('wrong-password-123');
  await page.getByRole('button', { name: '保存' }).click();
  // 失敗の共通の通知は消える途中で残っていることがあるので、シートの中の理由を見る
  await expect(sheet.getByText('今のパスワードが違います')).toBeVisible();
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(page.getByRole('button', { name: 'だれか を編集' })).toBeHidden();
});
