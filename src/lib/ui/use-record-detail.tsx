import DeleteIcon from '@mui/icons-material/Delete';
import { useState } from 'react';
import type { FormSheetProps } from '../form.ts';
import type { RecordAction } from './RecordSheet.tsx';

type Options = {
  /** 開いた時点から入力欄にするか（行を長押しで開いたとき） */
  initialEditing: boolean;
  /** 編集のフォーム（`useFormSubmit` の `sheet`） */
  form: FormSheetProps;
  /** 直せるか。false なら鉛筆を出さず、長押しでも入力欄にしない（ほかの人のメモ） */
  editable?: boolean;
  /** 削除の前に確かめる文と、消す処理。無ければ三点リーダーに削除を出さない（ほかの人のメモ） */
  remove?: { confirm: string; run: () => void } | undefined;
  /** 三点リーダーで削除の上に並べる、その記録だけの操作（メモのピン止め） */
  actions?: RecordAction[];
  onClose: () => void;
};

/**
 * 記録 1 件の詳細シート（`RecordSheet`）の閲覧と編集の切り替え、削除。立替・レモンの記録・メモが共有する
 * （予定・タスクは繰り返しの範囲の選択を挟むので `features/events/use-item-detail.tsx` が持つ）。
 * `sheet` は見出し（`title`）のほかに `RecordSheet` が要るものすべて（編集のフォーム、閉じる、鉛筆と
 * 三点リーダーの削除）で、そのまま広げて渡す。
 * 削除は確かめてから送り、結果を待たずに閉じる（楽観的更新で一覧からは既に消えている）。
 */
export function useRecordDetail({
  initialEditing,
  form,
  editable = true,
  remove,
  actions = [],
  onClose,
}: Options) {
  const [editing, setEditing] = useState(initialEditing && editable);
  return {
    editing,
    sheet: {
      ...form,
      onClose,
      editing,
      ...(editable ? { onEdit: () => setEditing(true) } : {}),
      actions: remove ? [...actions, deleteAction(remove, onClose)] : actions,
    },
  };
}

/** 三点リーダーの削除の見た目。押したときの処理は記録の種類が決める（予定・タスクは範囲の選択を挟む） */
export function deleteMenuAction(onClick: () => void): RecordAction {
  return { label: '削除', icon: <DeleteIcon />, danger: true, onClick };
}

/** 三点リーダーの削除。確かめてから消し、結果を待たずに閉じる */
function deleteAction(remove: NonNullable<Options['remove']>, onClose: () => void): RecordAction {
  return deleteMenuAction(() => {
    if (!window.confirm(remove.confirm)) return;
    remove.run();
    onClose();
  });
}
