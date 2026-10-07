import type { MoneyRecord } from '../../../../shared/money.ts';
import { ExpenseDetailSheet } from './ExpenseDetailSheet.tsx';
import { ImportedRecordSheet } from './ImportedRecordSheet.tsx';

type Props = {
  record: MoneyRecord;
  /** 開いた時点から入力欄にするか（行を長押しで開いたとき） */
  initialEditing: boolean;
  onClose: () => void;
};

/**
 * お金の記録の詳細（お金の画面の一覧とホームのタイムラインから開く）。手で入れた立替は直せる詳細、
 * Money Forward から取り込んだ入出金は読むだけの詳細（長押しでも閲覧で開く）
 */
export function MoneyRecordSheet({ record, initialEditing, onClose }: Props) {
  return record.account === null ? (
    <ExpenseDetailSheet expense={record} initialEditing={initialEditing} onClose={onClose} />
  ) : (
    <ImportedRecordSheet record={record} onClose={onClose} />
  );
}
