import DeleteIcon from '@mui/icons-material/Delete';
import { useState } from 'react';
import type { RecordAction } from './RecordSheet.tsx';

type Options = {
  /** 開いた時点から入力欄にするか（行を長押しで開いたとき） */
  initialEditing: boolean;
  /** 直すことも消すこともできない記録。鉛筆も三点リーダーも出さず、長押しでも入力欄にしない */
  readOnly?: boolean;
  /** 削除の前に確かめる文 */
  confirmDelete: string;
  remove: () => void;
  onClose: () => void;
};

/**
 * 記録 1 件の詳細シート（`RecordSheet`）の閲覧と編集の切り替え、削除。立替・レモンの記録・メモが共有する
 * （予定・タスクは繰り返しの範囲の選択を挟むので `features/events/use-item-detail.ts` が持つ）。
 * `sheet` はそのまま `RecordSheet` に渡す（鉛筆と三点リーダーの削除）。
 * 削除は確かめてから送り、結果を待たずに閉じる（楽観的更新で一覧からは既に消えている）。
 */
export function useRecordDetail({
  initialEditing,
  readOnly = false,
  confirmDelete,
  remove,
  onClose,
}: Options) {
  const [editing, setEditing] = useState(initialEditing && !readOnly);
  if (readOnly) return { editing, sheet: { editing, actions: [] } };

  const deleteAction: RecordAction = {
    label: '削除',
    icon: <DeleteIcon />,
    danger: true,
    onClick: () => {
      if (!window.confirm(confirmDelete)) return;
      remove();
      onClose();
    },
  };
  return { editing, sheet: { editing, onEdit: () => setEditing(true), actions: [deleteAction] } };
}
