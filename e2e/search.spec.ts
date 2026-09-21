import { expect, type Page, test } from '@playwright/test';
import { detailAction } from './detail.ts';
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
  const search = page.getByLabel('立替を検索');
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

/**
 * AppBar の絞り込みボタンで開く詳細検索。金額・日付の範囲と To・From で履歴を絞り込む。
 * 絞り込みは URL に持つので、開き直しても同じ絞り込みに戻る。
 */
test('詳細検索で金額・日付・To で絞り込める', async ({ page }) => {
  const tag = `E2E 絞込 ${Date.now()}`;
  const small = `${tag} 少額`;
  const large = `${tag} 高額`;
  await page.goto('/expenses');

  await addExpense(page, { amount: '500', description: small, spentOn: '2031-03-01' });
  await addExpense(page, {
    amount: '5000',
    description: large,
    spentOn: '2031-03-10',
    to: '相手',
  });
  const smallRow = page.getByRole('button', { name: new RegExp(small) });
  const largeRow = page.getByRole('button', { name: new RegExp(large) });

  // 絞り込みのフォームは AppBar の下に開く
  await page.getByRole('button', { name: '絞り込み' }).click();
  const filters = page.getByRole('group', { name: '絞り込み' });
  await expect(filters.getByLabel('最小金額')).toBeVisible();

  // 金額の範囲
  await filters.getByLabel('最小金額').fill('1000');
  await expect(smallRow).toHaveCount(0);
  await expect(largeRow).toBeVisible();
  await filters.getByLabel('最小金額').fill('');

  // 日付の範囲（両端を含む）
  await filters.getByLabel('終了日').fill('2031-03-01');
  await expect(smallRow).toBeVisible();
  await expect(largeRow).toHaveCount(0);
  await filters.getByLabel('終了日').fill('');

  // To（共有か、誰のために払ったか）
  await filters.getByLabel('To').click();
  await page.getByRole('option', { name: '共有' }).click();
  await expect(smallRow).toBeVisible();
  await expect(largeRow).toHaveCount(0);

  // 絞り込みは URL に残るので、開き直しても効いたまま（バッジは効いている条件の数）
  await expect(page).toHaveURL(/to=shared/);
  await page.reload();
  await expect(page.getByRole('button', { name: '絞り込み' })).toContainText('1');
  await expect(largeRow).toHaveCount(0);

  // 残高は他のテストと共有するので片付ける
  await page.goto('/expenses');
  for (const row of [smallRow, largeRow]) {
    page.once('dialog', (dialog) => dialog.accept());
    await row.click();
    await detailAction(page, '削除');
    await expect(row).toHaveCount(0);
  }
});

/** 立替を 1 件追加する（フォームは追加ボタンから開き、保存すると閉じて一覧に出る） */
async function addExpense(
  page: Page,
  input: { amount: string; description: string; spentOn: string; to?: string },
) {
  await page.getByRole('button', { name: '立替を追加' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('日付').fill(input.spentOn);
  if (input.to) {
    await form.getByLabel('To').click();
    await page.getByRole('option', { name: input.to }).click();
  }
  await form.getByLabel('内容', { exact: true }).fill(input.description);
  await form.getByLabel('金額（円）').fill(input.amount);
  await form.getByRole('button', { name: '保存' }).click();
  await expect(form).toHaveCount(0);
}

/** レモンの詳細検索。種別と実施日の範囲で記録を絞り込む（立替と同じ絞り込みボタン・フォーム） */
test('レモンの詳細検索で種別と日付の範囲で絞り込める', async ({ page }) => {
  const tag = `E2E 絞込 ${Date.now()}`;
  const watered = `${tag} 水やり`;
  const fertilized = `${tag} 施肥`;
  await page.goto('/lemon');

  await addCareLog(page, { careType: '水やり', note: watered, doneAt: '2031-04-02T09:00' });
  await addCareLog(page, { careType: '施肥', note: fertilized, doneAt: '2031-04-20T09:00' });
  const wateredRow = page.getByRole('button', { name: new RegExp(watered) });
  const fertilizedRow = page.getByRole('button', { name: new RegExp(fertilized) });

  await page.getByRole('button', { name: '絞り込み' }).click();
  const filters = page.getByRole('group', { name: '絞り込み' });

  // 種別
  await filters.getByLabel('種別').click();
  await page.getByRole('option', { name: '施肥' }).click();
  await expect(wateredRow).toHaveCount(0);
  await expect(fertilizedRow).toBeVisible();

  // 実施日の範囲（種別と重ねて効く。両方を満たす記録だけが残る）
  await filters.getByLabel('終了日').fill('2031-04-10');
  await expect(fertilizedRow).toHaveCount(0);
  await expect(page.getByText('一致する記録はありません')).toBeVisible();
  await expect(page.getByRole('button', { name: '絞り込み' })).toContainText('2');

  // 種別をすべてに戻すと、期間に入る水やりだけが残る
  await filters.getByLabel('種別').click();
  await page.getByRole('option', { name: 'すべて' }).click();
  await expect(wateredRow).toBeVisible();
  await expect(fertilizedRow).toHaveCount(0);
  await expect(page).toHaveURL(/until=2031-04-10/);

  // 状況のタイルは絞り込みに関わらず最新の実施日を示す
  await expect(page.getByRole('button', { name: /施肥/ }).first()).toBeVisible();

  // 記録は他のテストと共有するので片付ける
  await page.goto('/lemon');
  for (const row of [wateredRow, fertilizedRow]) {
    page.once('dialog', (dialog) => dialog.accept());
    await row.click();
    await detailAction(page, '削除');
    await expect(row).toHaveCount(0);
  }
});

/** レモンの記録を 1 件追加する */
async function addCareLog(page: Page, input: { careType: string; note: string; doneAt: string }) {
  await page.getByRole('button', { name: 'レモンの記録を追加' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('種別').click();
  await page.getByRole('option', { name: input.careType }).click();
  await form.getByLabel('日時').fill(input.doneAt);
  await form.getByLabel('メモ', { exact: true }).fill(input.note);
  await form.getByRole('button', { name: '保存' }).click();
  await expect(form).toHaveCount(0);
}
