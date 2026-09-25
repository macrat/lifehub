import { ItemDetailSheet } from '../../events/components/ItemDetailSheet.tsx';
import { ExpenseDetailSheet } from '../../expenses/components/ExpenseDetailSheet.tsx';
import { CareLogDetailSheet } from '../../lemon/components/CareLogDetailSheet.tsx';
import { MemoDetailSheet } from '../../memos/components/MemoDetailSheet.tsx';
import type { TimelineEntry } from '../queries.ts';

type Props = {
  entry: TimelineEntry;
  /** 開いた時点から入力欄にするか（行を長押しで開いたとき） */
  initialEditing: boolean;
  onClose: () => void;
};

/**
 * タイムラインの行の詳細。記録の種類ごとに、その機能の画面の一覧から開くのと同じ詳細を
 * ホームの上に開く（ホームからは移らない）。読む・直す・消すの手順はどこから開いても同じになる。
 */
export function TimelineEntrySheet({ entry, initialEditing, onClose }: Props) {
  const props = { initialEditing, onClose };
  switch (entry.type) {
    case 'event':
      return <ItemDetailSheet item={entry.item} {...props} />;
    case 'expense':
      return <ExpenseDetailSheet expense={entry.expense} {...props} />;
    case 'lemon':
      return <CareLogDetailSheet log={entry.log} {...props} />;
    case 'memo':
      return <MemoDetailSheet memo={entry.memo} {...props} />;
  }
}
