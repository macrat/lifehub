import { TOTP } from 'otpauth';
import type { Browser, Page } from 'playwright-core';
import type { DateString } from '../../../shared/types.ts';
import { env, type MoneyForwardAccount } from '../../lib/env.ts';
import { matchAccount, parseWithdrawalAmount, parseWithdrawalDate, parseYen } from './parse.ts';
import type { MoneyAccountRow } from './schema.ts';

/**
 * Money Forward ME をブラウザ（Playwright）で開き、口座の値と入出金の CSV を読む。
 * Money Forward ME には個人で使える API が無いので、人が使うのと同じ画面を開いて読む。
 * 入出金は家計簿の CSV ダウンロード（有料プランの機能）で読む。WHY: 画面の表を読むより Money Forward が配る形のほうが
 * 見た目の変更に左右されず、明細の ID（同じ明細を 2 度入れないための鍵）も載っている。
 * 口座の値（残高・引き落とし）は CSV に無いので画面から読む。画面の作りに頼る所はこのファイルにまとめ、
 * 読んだ文字の読み方は `parse.ts` に置く。
 */

const ME = 'https://moneyforward.com';

/**
 * Vercel で動かす Chromium。Vercel の関数には Chromium が無いので、AWS Lambda 向けに縮めた Chromium
 * （`@sparticuz/chromium-min`）を取り込みのたびに配布元から /tmp に展開して使う。
 * WHY NOT 本体を同梱する `@sparticuz/chromium`: 全 API が 1 つの関数なので（docs/architecture.md）、
 * 1 日 1 回しか使わない 60MB を、どの要求のコールドスタートにも背負わせることになる。
 * 版は `@sparticuz/chromium-min` と同じにする（依存を上げたらここも上げる）。
 */
const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar';

/** 画面 1 つを待つ長さ。ログインの遷移は Money Forward ID を経るので長めにする */
const TIMEOUT_MS = 30_000;

/** ログインの画面を進める回数の上限（メール → パスワード → 確認コード → アカウントの選択 → パスキーの案内） */
const MAX_SIGN_IN_STEPS = 8;

/** 画面の文字だけを読むので、読み込まない種類（取り込みの時間を短くする） */
const SKIPPED_RESOURCES = new Set(['image', 'font', 'media']);

type Credentials = { email: string; password: string; totpSecret?: string | undefined };

/** 口座 1 つの、画面から読んだ値（`money_accounts` の行） */
type AccountValues = Omit<MoneyAccountRow, 'fetchedAt'>;

/**
 * ログインして、accounts の値と、months（YYYY-MM）ごとの入出金の CSV（文字に直したもの）を読む。
 * 口座一覧に見つからない口座は値を null にする（名前の書き間違いは画面に「—」で出るので気づける）。
 * ログインや CSV の取得に失敗したら投げる。
 */
export async function scrapeMoneyForward(
  credentials: Credentials,
  accounts: readonly MoneyForwardAccount[],
  months: readonly string[],
): Promise<{ csvs: string[]; accounts: AccountValues[] }> {
  const browser = await launch();
  try {
    const context = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
    context.setDefaultTimeout(TIMEOUT_MS);
    await context.route('**/*', (route) =>
      SKIPPED_RESOURCES.has(route.request().resourceType()) ? route.abort() : route.continue(),
    );
    const page = await context.newPage();
    await signIn(page, credentials);
    const values = await readAccounts(page, accounts);
    const csvs = [];
    // 並べずに 1 つずつ読む（同じセッションで続けて CSV を求めても、Money Forward に負荷を掛けない）
    for (const month of months) csvs.push(await downloadCsv(page, month));
    return { csvs, accounts: values };
  } finally {
    await browser.close();
  }
}

async function launch(): Promise<Browser> {
  // ブラウザを動かす部品は取り込みのときだけ読む（API の要求のたびに読み込まない）
  const { chromium } = await import('playwright-core');
  if (!env.VERCEL) return chromium.launch();
  const { default: lambdaChromium } = await import('@sparticuz/chromium-min');
  return chromium.launch({
    executablePath: await lambdaChromium.executablePath(CHROMIUM_PACK_URL),
    args: lambdaChromium.args,
  });
}

/**
 * Money Forward ME にログインする。ME のログインは Money Forward ID（id.moneyforward.com）を経て戻ってくる。
 * 途中の画面（メール、パスワード、2 段階認証、アカウントの選択、パスキーの案内）は出たり出なかったりし、
 * 順も決まっていないので、ME に戻るまで「今出ている画面」を見て 1 つずつ進める。
 */
async function signIn(page: Page, credentials: Credentials): Promise<void> {
  await visit(page, `${ME}/sign_in`);
  const screens = {
    email: page.locator('input[name="mfid_user[email]"]'),
    password: page.locator('input[name="mfid_user[password]"]'),
    totp: page.locator('input#otp_attempt, input[autocomplete="one-time-code"]'),
    emailOtp: page.locator('input#email_otp'),
    account: page.locator(
      `button:has-text("${credentials.email}"), button:has-text("メールアドレスでログイン")`,
    ),
    later: page.getByRole('link', { name: '後で' }),
  };
  // Money Forward ID の画面の送信ボタン（メール・パスワード・2 段階認証で同じ）
  const submit = page.locator('#submitto');

  for (let step = 0; step < MAX_SIGN_IN_STEPS; step++) {
    if (isSignedIn(page.url())) return;
    const shown = Object.values(screens).reduce((a, b) => a.or(b));
    // どちらかが来るまで待つ（any は負けた側の失敗も受け止めるので、待ちきれずに落ちた側が宙に浮かない）
    await Promise.any([shown.first().waitFor(), page.waitForURL((url) => isSignedIn(url.href))]);
    if (isSignedIn(page.url())) return;

    const before = page.url();
    if (await screens.emailOtp.isVisible()) {
      throw new Error(
        'moneyforward: メールの確認コードを求められました。Money Forward ID で認証アプリの 2 段階認証を設定し、MONEYFORWARD_TOTP_SECRET を渡してください',
      );
    } else if (await screens.totp.isVisible()) {
      if (!credentials.totpSecret) {
        throw new Error(
          'moneyforward: 2 段階認証のコードを求められました。MONEYFORWARD_TOTP_SECRET を渡してください',
        );
      }
      await screens.totp.first().fill(new TOTP({ secret: credentials.totpSecret }).generate());
      await submit.click();
    } else if (await screens.email.isVisible()) {
      await screens.email.fill(credentials.email);
      await submit.click();
    } else if (await screens.password.isVisible()) {
      await screens.password.fill(credentials.password);
      await submit.click();
    } else if (await screens.account.first().isVisible()) {
      await screens.account.first().click();
    } else {
      await screens.later.click();
    }
    await page.waitForURL((url) => url.href !== before);
  }
  throw new Error(`moneyforward: ログインできませんでした（${new URL(page.url()).pathname}）`);
}

/**
 * ME に戻ってきたか。ログインしていなければ ME の /sign_in は Money Forward ID へ送り出すので、
 * ME の /sign_in 以外の画面にいればログインできている
 */
function isSignedIn(href: string): boolean {
  const url = new URL(href);
  return url.origin === ME && !url.pathname.startsWith('/sign_in');
}

/**
 * 口座の値を読む。
 * - 残高・評価額: 口座一覧（/accounts）の表の金額の列
 * - カードの引き落とし額: カードの詳細（/accounts/show/...）の見出し「引き落とし予定額：…」
 * - カードの引き落とし日: トップの口座の並び（`li.account`）の「引き落とし日:(…)」。詳細の画面には日付が無い
 */
async function readAccounts(
  page: Page,
  accounts: readonly MoneyForwardAccount[],
): Promise<AccountValues[]> {
  const names = accounts.map((account) => account.name);

  await visit(page, `${ME}/accounts`);
  await page.locator('#account-table').first().waitFor();
  const listed = new Map<string, { balance: number | null; href: string | null }>();
  for (const row of await page.locator('#account-table tbody tr').all()) {
    const cells = await row.locator('td').allInnerTexts();
    const name = matchAccount(cells[0]?.split('\n')[0] ?? '', names);
    if (!name || listed.has(name)) continue;
    const links = await row.locator('a[href*="/accounts/show"]').all();
    listed.set(name, {
      balance: parseYen(cells[1] ?? ''),
      href: (await links[0]?.getAttribute('href')) ?? null,
    });
  }

  const hasCard = accounts.some((account) => account.kind === 'card');
  const withdrawalDates = hasCard ? await readWithdrawalDates(page, names) : new Map();
  // カードの詳細は互いに依らないので、カードごとにタブを開いて並べて読む
  return Promise.all(
    accounts.map(async ({ kind, name }) => {
      const found = listed.get(name);
      const card = kind === 'card';
      return {
        name,
        balance: found?.balance ?? null,
        withdrawalAmount: card && found?.href ? await readWithdrawalAmount(page, found.href) : null,
        withdrawalOn: card ? (withdrawalDates.get(name) ?? null) : null,
      };
    }),
  );
}

/** カードの詳細を別のタブで開いて、引き落とし額を読む */
async function readWithdrawalAmount(page: Page, href: string): Promise<number | null> {
  const tab = await page.context().newPage();
  try {
    await visit(tab, new URL(href, ME).href);
    return parseWithdrawalAmount(await tab.locator('h1.heading-small').allInnerTexts());
  } finally {
    await tab.close();
  }
}

/** トップの口座の並びから、口座ごとの引き落とし日 */
async function readWithdrawalDates(
  page: Page,
  names: readonly string[],
): Promise<Map<string, DateString>> {
  await visit(page, ME);
  const dates = new Map<string, DateString>();
  for (const item of await page.locator('li.account').all()) {
    const [heading = ''] = await item.locator('.heading-accounts').allInnerTexts();
    const name = matchAccount(heading.split('\n')[0] ?? '', names);
    const [schedule = ''] = await item.locator('ul.amount > li.schedule').allInnerTexts();
    const date = parseWithdrawalDate(schedule);
    if (name && date && !dates.has(name)) dates.set(name, date);
  }
  return dates;
}

/**
 * 1 か月分の入出金の CSV。ログインしたブラウザのセッション（Cookie）で求め、Shift_JIS を文字に直す。
 * セッションが切れているとログインの画面（HTML）が返るので、CSV の見出しで確かめる。
 */
async function downloadCsv(page: Page, month: string): Promise<string> {
  const [year = '', m = ''] = month.split('-');
  const response = await page.request.get(
    `${ME}/cf/csv?${new URLSearchParams({ from: `${year}/${m}/01`, month: String(Number(m)), year })}`,
  );
  if (!response.ok()) throw new Error(`moneyforward: CSV を取れません（${response.status()}）`);
  const text = new TextDecoder('shift_jis').decode(await response.body());
  if (!text.trimStart().startsWith('"計算対象"')) {
    throw new Error(
      'moneyforward: CSV ではないものが返りました（ログインが切れたか、有料プランではありません）',
    );
  }
  return text;
}

/** 画面を開く。読むのは文字だけなので、画像などの読み込み（load）を待たず、文書ができた所で進む */
async function visit(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}
