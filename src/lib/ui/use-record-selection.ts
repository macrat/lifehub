import { useCallback, useState } from 'react';

/** 詳細を開いている記録と、どちらの顔（閲覧・編集）で開いたか */
export type RecordSelection<T> = { record: T; editing: boolean };

/**
 * 一覧から記録を選んで詳細を開く画面の状態。アプリ全体で「単押しは閲覧、長押しは編集」なので、
 * 選んだ記録と一緒にどちらで開いたかを持つ。詳細は選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 * open / close は固定する（カレンダーは面に渡す関数の同一性で描き直しを省く。CalendarPane）。
 */
export function useRecordSelection<T>() {
  const [selected, setSelected] = useState<RecordSelection<T> | null>(null);
  const open = useCallback((record: T, editing = false) => setSelected({ record, editing }), []);
  const close = useCallback(() => setSelected(null), []);
  return { selected, open, close };
}
