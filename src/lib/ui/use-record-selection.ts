import { useCallback } from 'react';
import { useOpenWith } from './use-toggle.ts';

/** 詳細を開いている記録と、どちらの顔（閲覧・編集）で開いたか */
export type RecordSelection<T> = { record: T; editing: boolean };

/**
 * 一覧から記録を選んで詳細を開く画面の状態。アプリ全体で「単押しは閲覧、長押しは編集」なので、
 * 選んだ記録と一緒にどちらで開いたかを持つ。詳細は選んでいる間だけマウントする（閉じれば編集中の状態も消える）。
 * open は一覧の onSelect（記録, 編集で開くか）にそのまま渡せる形にする。
 */
export function useRecordSelection<T>() {
  const { value: selected, open: select, close } = useOpenWith<RecordSelection<T>>();
  const open = useCallback((record: T, editing = false) => select({ record, editing }), [select]);
  return { selected, open, close };
}
