import DeleteIcon from '@mui/icons-material/Delete';
import { useState } from 'react';
import type { FormSheetProps } from '../form.ts';
import type { RecordAction } from './RecordSheet.tsx';

type Options = {
  /** 開いた時点から入力欄にするか（行を長押しで開いたとき） */
  initialEditing: boolean;
  /** 直すことも消すこともできない記録。鉛筆も三点リーダーも出さず、長押しでも入力欄にしない */
  readOnly?: boolean;
  /** 編集のフォーム（`useFormSubmit` の `sheet`） */
  form: FormSheetProps;
  /** 削除の前に確かめる文 */
  confirmDelete: string;
  remove: () => void;
  onClose: () => void;
};

/**
 * 記録 1 件の詳細シート（`RecordSheet`）の閲覧と編集の切り替え、削除。立替・レモンの記録・メモが共有する
 * （予定・タスクは繰り返しの範囲の選択を挟むので `features/events/use-item-detail.ts` が持つ）。
 * `sheet` は見出し（`title`）のほかに `RecordSheet` が要るものすべて（編集のフォーム、閉じる、鉛筆と
 * 三点リーダーの削除）で、そのまま広げて渡す。
 * 削除は確かめてから送り、結果を待たずに閉じる（楽観的更新で一覧からは既に消えている）。
 */
export function useRecordDetail({
  initialEditing,
  readOnly = false,
  form,
  confirmDelete,
  remove,
  onClose,
}: Options) {
  const [editing, setEditing] = useState(initialEditing && !readOnly);
  if (readOnly) return { editing, sheet: { ...form, onClose, editing, actions: [] } };

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
  return {
    editing,
    sheet: { ...form, onClose, editing, onEdit: () => setEditing(true), actions: [deleteAction] },
  };
}
