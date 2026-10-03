import { careLogTitle } from '../../../shared/lemon.ts';
import { useRecordDetail } from '../../lib/ui/use-record-detail.tsx';
import { type CareLog, useDeleteCareLog, useUpdateCareLog } from './queries.ts';
import { useCareLogForm } from './use-care-log-form.ts';

/**
 * 世話の記録の詳細（`CareLogDetailSheet`）の状態と操作。編集のフォーム・保存・削除をまとめ、シートには
 * 表示するもの（`sheet`・見出し・閲覧か編集か・入力欄）だけを返す。保存・削除が済んだら詳細を閉じる（`onClose`）。
 */
export function useCareLogDetail(log: CareLog, initialEditing: boolean, onClose: () => void) {
  const updateLog = useUpdateCareLog();
  const deleteLog = useDeleteCareLog();
  const { careTypes, fields, sheet } = useCareLogForm({
    initial: log,
    onSubmit: (input) => updateLog.mutateAsync({ id: log.id, ...input }),
    onSaved: onClose,
  });
  const detail = useRecordDetail({
    initialEditing,
    form: sheet,
    remove: { confirm: 'この記録を削除しますか？', run: () => deleteLog.mutate(log.id) },
    onClose,
  });
  // 見出しは入力中の項目に合わせて変わる
  return { ...detail, title: careLogTitle(careTypes), fields };
}
