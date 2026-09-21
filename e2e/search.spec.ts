import { expect, test } from '@playwright/test';
import { E2E_USER } from './global-setup.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(E2E_USER.email);
  await page.getByLabel('パスワード').fill(E2E_USER.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL('/');
});

/**
 * AppBar の検索窓。入力は画面の状態で受けて URL は置き換えるだけなので、
 * 変換中の文字が書き戻されず（IME で変換できる）、打った分だけ履歴も増えない。
 */
test('検索窓で日本語を変換でき、履歴を増やさずに URL が変わる', async ({ page }) => {
  await page.goto('/expenses');
  const search = page.getByLabel('内容を検索');
  await search.click();

  // 未確定の文字を 1 文字ずつ増やす（変換候補を選ぶ前の状態）
  const ime = await page.context().newCDPSession(page);
  for (const text of ['に', 'にほ', 'にほん']) {
    await ime.send('Input.imeSetComposition', {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
    await expect(search).toHaveValue(text);
  }

  // 変換して確定する
  await ime.send('Input.insertText', { text: '日本語' });
  await expect(search).toHaveValue('日本語');
  await expect(page).toHaveURL(`/expenses?q=${encodeURIComponent('日本語')}`);

  // 戻るは打った文字ではなく直前の画面へ
  await page.goBack();
  await expect(page).toHaveURL('/');
});

test('URL の検索語は開き直しても残る', async ({ page }) => {
  await page.goto(`/lemon?q=${encodeURIComponent('肥料')}`);
  await expect(page.getByLabel('メモを検索')).toHaveValue('肥料');
});
