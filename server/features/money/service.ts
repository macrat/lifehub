import { addMonths, today, toMonthString } from '../../../shared/date.ts';
import { newId } from '../../../shared/id.ts';
import {
  expenseMoneyEntry,
  type MoneyAccount,
  type MoneyEntry,
  type MoneyTransaction,
  sortMoneyEntries,
  transactionMoneyEntry,
} from '../../../shared/money.ts';
import { transactionEntry } from '../../../shared/timeline.ts';
import type { HistoryPage } from '../../../shared/types.ts';
import type { ExpenseListQuery } from '../../../shared/validation/expenses.ts';
import { env, type MoneyForwardAccount } from '../../lib/env.ts';
import { type HistorySource, mergeHistoryPage } from '../../lib/history-source.ts';
import { recordTimelineSource } from '../../lib/timeline-source.ts';
import * as expenses from '../expenses/service.ts';
import * as repository from './repository.ts';
import type { MoneyAccountRow, MoneyTransactionRow } from './schema.ts';

/** 取り込む口座（環境変数 `MONEYFORWARD_ACCOUNTS` に書いた順）。書いていなければ空 */
const configuredAccounts: readonly MoneyForwardAccount[] = env.MONEYFORWARD_ACCOUNTS ?? [];

const accountNames = configuredAccounts.map((account) => account.name);

/**
 * Money Forward から口座の値と入出金を取り込む（日次の Cron）。取り込んだ明細と口座の数を返す。
 * 入出金は先月と今月の 2 か月分の CSV を読み、読んだ明細の最も古い日から最も新しい日までを、Money Forward の今の明細に
 * 置き換える（`saveImport`。Money Forward で消された明細はここで消える）。環境変数から外した口座の行と明細も、ここで消す。
 * WHY 外した口座を取り込みで消す: 読むたびに今の口座で絞ると、画面・タイムライン・MCP のどの読み出しにも同じ条件が要り、
 * 消えない行が溜まり続ける。外したことが画面に出るのは次の取り込みから（すぐ消したければ Cron を手で呼ぶ）。
 * WHY 先月も: カードの明細は使った日から数日遅れて届くので、月の初めに読むと先月の終わりの明細がまだ増える。
 * WHY NOT もっと前まで: 古い明細はもう変わらず、月ごとに CSV を読むぶん取り込みが長くなる。
 * WHY 置き換える範囲を読んだ明細の日付で決める: Money Forward は月の始まりの日を設定で変えられ、CSV が暦の月と
 * ずれることがある。暦の月で置き換えると、CSV に載らなかった日の明細を消してしまう。
 * ログイン情報か口座が無ければ何もしない（本番では起動時に止まる。`server/lib/env.ts` の `PRODUCTION_REQUIRED`）。
 * 取り込みに失敗したら何も書かずに投げる（前回の値が残る。Cron の失敗として残す）。
 * ブラウザと CSV・2 段階認証の部品は取り込みのときだけ読む（同じ関数が受ける画面の API の要求のたびに読み込まない）。
 */
export async function syncMoneyForward(
  now: Date = new Date(),
): Promise<{ transactions: number; accounts: number } | { skipped: true }> {
  const {
    MONEYFORWARD_EMAIL: email,
    MONEYFORWARD_PASSWORD: password,
    MONEYFORWARD_TOTP_SECRET: totpSecret,
  } = env;
  if (!email || !password || configuredAccounts.length === 0) return { skipped: true };

  const [{ scrapeMoneyForward }, { parseTransactionsCsv }] = await Promise.all([
    import('./moneyforward.ts'),
    import('./parse.ts'),
  ]);
  const month = toMonthString(today(now));
  const months = [addMonths(month, -1), month];
  const scraped = await scrapeMoneyForward(
    { email, password, totpSecret },
    configuredAccounts,
    months,
  );

  // 2 か月の CSV の境目で同じ明細が重なっても 1 行にする
  const transactions = [
    ...new Map(
      scraped.csvs
        .flatMap((csv) => parseTransactionsCsv(csv, accountNames))
        .map((row) => [row.sourceId, { ...row, id: newId() }]),
    ).values(),
  ];
  const days = transactions.map((row) => row.occurredOn).sort();
  const [from, to] = [days[0], days.at(-1)];
  const fetchedAt = new Date();
  await repository.saveImport({
    accounts: accountNames,
    range: from && to ? { from, to } : null,
    transactions,
    accountRows: scraped.accounts.map((account) => ({ ...account, fetchedAt })),
  });
  return { transactions: transactions.length, accounts: scraped.accounts.length };
}

/** お金の画面のカード（環境変数に書いた順）。まだ取り込んでいない口座は値を null にして並べる */
export async function listAccounts(): Promise<MoneyAccount[]> {
  const rows = new Map((await repository.findAccounts()).map((row) => [row.name, row]));
  return configuredAccounts.map((account) => toAccount(account, rows.get(account.name)));
}

/**
 * お金の画面の一覧の 1 ページ（古い順）: 立替と取り込んだ入出金を 1 本に並べる。絞り込みは立替の一覧と同じ条件
 * （入出金への読み替えは `repository.ts` の `history`）。ページの分け方は立替だけの履歴と同じで、日の途中では切らない
 * （`mergeHistoryPage`）。
 */
export async function listMoney({
  before,
  ...filter
}: ExpenseListQuery): Promise<HistoryPage<MoneyEntry>> {
  const transactions = repository.history(filter);
  const page = await mergeHistoryPage<MoneyEntry>(
    [
      mapSource(expenses.historySource(filter), expenseMoneyEntry),
      {
        recentDays: transactions.recentDays,
        hasBefore: transactions.hasBefore,
        findInDays: async (from, until) =>
          (await transactions.findInDays(from, until)).map((row) =>
            transactionMoneyEntry(toTransaction(row)),
          ),
      },
    ],
    before,
  );
  return { ...page, items: sortMoneyEntries(page.items) };
}

/** 出どころの行を一覧の行にする */
function mapSource<T>(
  source: HistorySource<T>,
  toEntry: (record: T) => MoneyEntry,
): HistorySource<MoneyEntry> {
  return {
    ...source,
    findInDays: async (from, before) => (await source.findInDays(from, before)).map(toEntry),
  };
}

/** タイムラインに並べる入出金（置く日時は shared/timeline.ts の `transactionEntry`。キーワードは内容の部分一致） */
export const timelineSource = recordTimelineSource(repository.timeline, (row) =>
  transactionEntry(toTransaction(row)),
);

/** 種類ごとに、その種類のカードが出す値だけを持たせる（カードの利用残高は出さない） */
function toAccount(
  { name, kind }: MoneyForwardAccount,
  row: MoneyAccountRow | undefined,
): MoneyAccount {
  const card = kind === 'card';
  return {
    name,
    kind,
    balance: card ? null : (row?.balance ?? null),
    withdrawalAmount: card ? (row?.withdrawalAmount ?? null) : null,
    withdrawalOn: card ? (row?.withdrawalOn ?? null) : null,
    fetchedAt: row?.fetchedAt.toISOString() ?? null,
  };
}

/** 行から画面に出さない列（取り込みの鍵と監査列）を除く */
function toTransaction({
  sourceId: _,
  createdAt: __,
  updatedAt: ___,
  ...transaction
}: MoneyTransactionRow): MoneyTransaction {
  return transaction;
}
