import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { DateHeading } from '../../../lib/ui/DateHeading.tsx';
import { InfiniteScroll } from '../../../lib/ui/InfiniteScroll.tsx';
import { MARK_DOT_SX, MarkedRow } from '../../../lib/ui/MarkedRow.tsx';
import { useUserColor } from '../../users/use-user-color.ts';
import { useUserLabels } from '../../users/use-user-labels.ts';
import type { Expense } from '../queries.ts';
import { formatYen } from './BalanceSummary.tsx';

/**
 * 金額の列の幅。カレンダーの時刻の列より少し広く、6 桁の金額（¥100,000）まで折り返さない。
 * 桁は `MarkedRow` が揃えるので、ここは帳簿と同じ右寄せだけを足す。
 */
const AMOUNT_WIDTH = 80;

type Props = {
  /** 読んだ分の履歴（古い順） */
  expenses: Expense[];
  /** 上の端へ近づいたとき（古いほうを読む）。undefined なら読む物が無いか読み込み中 */
  onReachStart: (() => void) | undefined;
  /** 一覧の上に貼り付けておく物（絞り込みのフォームと残高） */
  header: ReactNode;
  /** 変わったら新しいほうの末尾へ戻す（絞り込みを変えたとき） */
  resetKey: string;
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかはページが判断する */
  emptyMessage: string;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (expense: Expense, editing: boolean) => void;
};

/**
 * 立替の履歴（上が古く下が新しい）。最初は一番下（最新）を出し、上へスクロールすると古いほうのページを
 * 読み足す（`useExpenseHistory`、`InfiniteScroll`）。使った日ごとに見出しを立て、その下に 1 件 1 行で並べる。
 * 体裁はカレンダーのリスト表示と同じ（`DateHeading` と `MarkedRow`）で、中身だけが違う:
 * 印は誰から誰へ渡ったかの色の点（`expenseMarkBackground`）、主列は金額、本文は内容と名前。
 * 名前は共有なら払った人だけ、相手が決まっていれば簿記の並びで「To ← From」。
 */
export function ExpenseList({
  expenses,
  onReachStart,
  header,
  resetKey,
  emptyMessage,
  onSelect,
}: Props) {
  const { label } = useUserLabels();
  const colorFor = useUserColor();
  // ページは日の途中で切れないので、日ごとのまとまりが 2 つに割れることはない
  const days = [...Map.groupBy(expenses, (e) => e.spentOn)];
  return (
    <InfiniteScroll
      header={header}
      onReachStart={onReachStart}
      initialPosition="end"
      resetKey={resetKey}
    >
      {days.length === 0 && (
        <Typography color="text.secondary" sx={{ px: 2, py: 2 }}>
          {emptyMessage}
        </Typography>
      )}
      {days.map(([date, sameDay]) => (
        <Box key={date} sx={{ pb: 1 }}>
          <DateHeading date={date} />
          {sameDay.map((expense) => (
            <MarkedRow
              key={expense.id}
              onSelect={(editing) => onSelect(expense, editing)}
              mark={
                <Box
                  sx={MARK_DOT_SX}
                  style={{ background: expenseMarkBackground(expense, colorFor) }}
                />
              }
              leadWidth={AMOUNT_WIDTH}
              lead={
                <Typography variant="body2" component="div" sx={{ textAlign: 'right' }}>
                  {formatYen(expense.amount)}
                </Typography>
              }
            >
              <Typography sx={{ overflowWrap: 'anywhere' }}>{expense.description}</Typography>
              <Typography variant="caption" color="text.secondary" component="div" noWrap>
                {expense.toUserId === null
                  ? label(expense.fromUserId)
                  : `${label(expense.toUserId)} ← ${label(expense.fromUserId)}`}
              </Typography>
            </MarkedRow>
          ))}
        </Box>
      ))}
    </InfiniteScroll>
  );
}

/**
 * 印の点の塗り。共有のために払ったものは払った人 1 色、人から人へのものは
 * 斜め 45° で割り、左下を To・右上を From にする。
 *
 * WHY 斜めに割る: 縦か横の境目で割ると、どちらの側がどちらの人かを示す手掛かりが
 * 上下か左右のどちらか一方しか無い。斜めなら、左が To・右が From（名前と同じ
 * 「To ← From」の並び）と、右上から左下へ（From から To へお金が動く向き）を
 * 1 つの点で同時に示せる。2 色はにじませず半分で切り替えて、色を見分けやすくする。
 */
function expenseMarkBackground(
  expense: Expense,
  colorFor: ReturnType<typeof useUserColor>,
): string {
  const from = colorFor(expense.fromUserId).fill;
  if (expense.toUserId === null) return from;
  const to = colorFor(expense.toUserId).fill;
  return `linear-gradient(45deg, ${to} 50%, ${from} 50%)`;
}
