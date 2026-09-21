import { useState } from 'react';
import type { RecurrenceScope } from '../../../shared/validation/events.ts';

export type RecurrenceAction = 'edit' | 'delete';

/**
 * 予定・タスクの詳細（`ItemDetailSheet`）の「編集／削除 → 繰り返しなら範囲を選ぶ → 実行」の流れ。
 * 削除は確認の後に onDelete を呼び、編集は選んだ範囲（editScope）を返して入力欄に切り替えさせる。
 * 編集をやめるのは詳細ごと閉じるときだけなので、範囲を戻す操作は持たない。
 */
export function useRecurrenceEditing(options: {
  isRecurring: boolean;
  onDelete: (scope: RecurrenceScope) => void;
}) {
  const [pending, setPending] = useState<RecurrenceAction | null>(null);
  const [editScope, setEditScope] = useState<RecurrenceScope | null>(null);

  const proceed = (action: RecurrenceAction, scope: RecurrenceScope) => {
    setPending(null);
    if (action === 'edit') {
      setEditScope(scope);
      return;
    }
    const message =
      scope === 'all' && options.isRecurring ? 'すべての回を削除しますか？' : '削除しますか？';
    if (!window.confirm(message)) return;
    options.onDelete(scope);
  };

  return {
    /** 範囲の選択を待っている操作（繰り返しのときだけ） */
    pending,
    editScope,
    start: (action: RecurrenceAction) =>
      options.isRecurring ? setPending(action) : proceed(action, 'all'),
    selectScope: (scope: RecurrenceScope) => pending && proceed(pending, scope),
    cancel: () => setPending(null),
  };
}
