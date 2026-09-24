import { useState } from 'react';

type Options = {
  /** 開いた時点から入力欄にするか（行を長押しで開いたとき） */
  initialEditing: boolean;
  /** 削除の前に確かめる文 */
  confirmDelete: string;
  remove: () => void;
  onClose: () => void;
};

/**
 * 記録 1 件の詳細シート（`RecordSheet`）の閲覧と編集の切り替え、削除。立替・レモンの記録が共有する
 * （予定・タスクは繰り返しの範囲の選択を挟むので `features/events/use-item-detail.ts` が持つ）。
 * 削除は確かめてから送り、結果を待たずに閉じる（楽観的更新で一覧からは既に消えている）。
 */
export function useRecordDetail({ initialEditing, confirmDelete, remove, onClose }: Options) {
  const [editing, setEditing] = useState(initialEditing);
  return {
    editing,
    startEdit: () => setEditing(true),
    remove: () => {
      if (!window.confirm(confirmDelete)) return;
      remove();
      onClose();
    },
  };
}
