import { addMonths, today, toMonthString } from '../../../shared/date.ts';
import type { ExpenseTotal } from '../../../shared/expenses.ts';
import { newId } from '../../../shared/id.ts';
import {
  type MoneyAccount,
  type MoneyTransaction,
  transferParties,
} from '../../../shared/money.ts';
import { transactionEntry } from '../../../shared/timeline.ts';
import type { ExpenseFilter } from '../../../shared/validation/expenses.ts';
import type { MoneyRule } from '../../../shared/validation/money.ts';
import { env, type MoneyForwardAccount } from '../../lib/env.ts';
import type { HistorySource } from '../../lib/history-source.ts';
import { recordTimelineSource } from '../../lib/timeline-source.ts';
import * as repository from './repository.ts';
import { applyRules } from './rules.ts';
import type { MoneyAccountRow, MoneyRuleRow, MoneyTransactionRow } from './schema.ts';

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
  const [scraped, rules] = await Promise.all([
    scrapeMoneyForward({ email, password, totpSecret }, configuredAccounts, months),
    listRules(),
  ]);

  // 2 か月の CSV の境目で同じ明細が重なっても 1 行にする。内容欄は今のルールで読み替える（元のままの内容欄も持つ）
  const transactions = [
    ...new Map(
      scraped.csvs
        .flatMap((csv) => parseTransactionsCsv(csv, accountNames))
        .map((row) => [
          row.sourceId,
          { ...row, ...applyRules(rules, row.originalDescription), id: newId() },
        ]),
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
 * お金の画面の一覧に並べる入出金（`HistorySource`。日は明細の日付）。絞り込みは立替の一覧と同じ条件の読み替え
 * （`repository.ts` の `history`）。立替と 1 本に並べてページに分けるのは立替の service（`listMoneyEntries`）
 */
export function historySource(filter: ExpenseFilter): HistorySource<MoneyTransaction> {
  const queries = repository.history(filter);
  return {
    recentDays: queries.recentDays,
    hasBefore: queries.hasBefore,
    findInDays: async (from, before) => (await queries.findInDays(from, before)).map(toTransaction),
  };
}

/** ルールで「共有」との立替にした入出金の、当事者ごとの合計（立替の精算に足す。`ExpenseTotal` の形） */
export async function getTransferTotals(): Promise<ExpenseTotal[]> {
  return repository.sumTransfers();
}

/** 入出金の読み替えのルール（上から順） */
export async function listRules(): Promise<MoneyRule[]> {
  return (await repository.findRules()).map(toRule);
}

/**
 * ルールの並びを置き換え、取り込み済みのすべての入出金を新しいルールで読み替え直す（元の内容欄から当て直すので、
 * 足した・直した・消したルールが過去の入出金にも効く）。userId は保存した人。
 * 入出金は数千件の桁なので、全件を読んで当て直す。変わらない行も書くが、1 つの update にまとめる（`replaceRules`）
 */
export async function saveRules(rules: MoneyRule[], userId: string): Promise<void> {
  const originals = await repository.findOriginals();
  const rewritten = originals.map(({ id, originalDescription }) => ({
    id,
    ...applyRules(rules, originalDescription),
  }));
  await repository.replaceRules(rules, userId, rewritten);
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

/** 行を画面に出す形にする（内容欄は読み替えた後。読み替えの向きと対象者は立替の当事者にする） */
function toTransaction(row: MoneyTransactionRow): MoneyTransaction {
  return {
    id: row.id,
    account: row.account,
    occurredOn: row.occurredOn,
    description: row.description,
    amount: row.amount,
    parties: row.direction && row.userId ? transferParties(row.direction, row.userId) : null,
  };
}

function toRule({
  id,
  pattern,
  replaceDescription,
  replacement,
  kind,
  userId,
  hidden,
}: MoneyRuleRow): MoneyRule {
  return { id, pattern, replaceDescription, replacement, kind, userId, hidden };
}
