import { apiOf } from './api.ts';
import { openHome } from './auth.ts';
import { type Created, deleteRecord } from './history.ts';
import { expect, test } from './test.ts';

/**
 * AppBar の検索窓。入力は画面の状態で受けて URL は置き換えるだけなので、
 * 変換中の文字が書き戻されず（IME で変換できる）、打った分だけ履歴も増えない。
 */
test('検索窓で日本語を変換でき、履歴を増やさずに URL が変わる', async ({ page }) => {
  // 戻る先（直前の画面）としてホームを開いておく
  await openHome(page);
  await page.goto('/money');
  const search = page.getByLabel('記録を検索');
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
  await expect(page).toHaveURL(`/money?q=${encodeURIComponent('日本語')}`);

  // 戻るは打った文字ではなく直前の画面へ
  await page.goBack();
  await expect(page).toHaveURL('/');
});

/**
 * 検索窓は router を通さずに URL の q を書き換える。そのあとの絞り込みの変更（router を通す）で
 * q が書き戻されて消えないこと（消えると、開き直したときにキーワードが失われる）。
 */
test('キーワードを打ってから絞り込みを変えても、URL のキーワードは残る', async ({ page }) => {
  await page.goto('/money');
  await page.getByLabel('記録を検索').fill('スーパー');
  await expect(page).toHaveURL(/q=/);

  await page.getByRole('button', { name: '絞り込み' }).click();
  await page.getByRole('group', { name: '絞り込み' }).getByLabel('最小金額').fill('1000');
  await expect(page).toHaveURL(/min=1000/);
  expect(new URL(page.url()).searchParams.get('q')).toBe('スーパー');

  await page.reload();
  await expect(page.getByLabel('記録を検索')).toHaveValue('スーパー');
});

/**
 * AppBar の絞り込みボタンで開く詳細検索。金額・日付の範囲と To・From で履歴を絞り込む。
 * 絞り込みは URL に持つので、開き直しても同じ絞り込みに戻る。
 */
test('詳細検索で金額・日付・To で絞り込める', async ({ page }) => {
  const tag = `E2E 絞込 ${Date.now()}`;
  const small = `${tag} 少額`;
  const large = `${tag} 高額`;
  const api = apiOf(page.request);
  const me = await api.me.get.query();
  const partner = me.users.find((user) => user.id !== me.id)?.id ?? null;
  const expense = async (body: {
    amount: number;
    description: string;
    occurredOn: string;
    toUserId?: string | null;
  }): Promise<Created> => {
    const id = crypto.randomUUID();
    await api.money.create.mutate({ id, fromUserId: me.id, toUserId: null, ...body });
    return { router: 'money', id };
  };
  const records = await Promise.all([
    expense({ amount: 500, description: small, occurredOn: '2031-03-01' }),
    expense({ amount: 5000, description: large, occurredOn: '2031-03-10', toUserId: partner }),
  ]);
  await page.goto('/money');
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

  // 精算は他のテストと共有するので片付ける
  await Promise.all(records.map((record) => deleteRecord(page, record)));
});

/** レモンの詳細検索。種別（項目）と実施日の範囲で記録を絞り込む（立替と同じ絞り込みボタン・フォーム） */
test('レモンの詳細検索で種別と日付の範囲で絞り込める', async ({ page }) => {
  const tag = `E2E 絞込 ${Date.now()}`;
  const watered = `${tag} 水やり`;
  const fertilized = `${tag} 施肥`;
  const careLog = async (
    careType: 'water' | 'fertilize',
    note: string,
    doneAt: string,
  ): Promise<Created> => {
    const id = crypto.randomUUID();
    await apiOf(page.request).lemon.create.mutate({ id, careTypes: [careType], note, doneAt });
    return { router: 'lemon', id };
  };
  const records = await Promise.all([
    careLog('water', watered, '2031-04-02T09:00:00+09:00'),
    careLog('fertilize', fertilized, '2031-04-20T09:00:00+09:00'),
  ]);
  await page.goto('/lemon');
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

  // 記録は他のテストと共有するので片付ける
  await Promise.all(records.map((record) => deleteRecord(page, record)));
});
