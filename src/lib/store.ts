import { useSyncExternalStore } from 'react';

/**
 * 画面をまたいで 1 つだけ持つ値（アプリ全体で 1 つの知らせ、選んでいる最中の色など）。
 * React の外に置き、読む側は `useSyncExternalStore`（React 標準の購読）で読む。
 *
 * WHY: 値を持つ場所と読む場所が木の上で離れている（テーマは最上位、書き換えるのは画面の中）ものを、
 * Provider と受け渡しを増やさずに 1 か所へ置くため。返すのは読むフックと書く関数の 2 つだけなので、
 * 値の書き換えは必ずこの関数を通る。
 * WHY NOT: React の context は Provider を木の上に足す必要があり、状態を持つ階層と使う階層が
 * 離れているほど受け渡しが増える。状態管理のライブラリは、この規模（数行の値を 2 つ）には大きい。
 *
 * 使う側は名前を付けて公開する: `export const [usePreviewHue, previewHue] = createStore<number | null>(null)`
 */
export function createStore<T>(initial: T) {
  let current = initial;
  const listeners = new Set<() => void>();

  function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }

  /**
   * 値を読む。select を渡すと値から導いた物を読み、それが変わったときだけ描き直す
   * （たくさんの部品が同じ値を見て、それぞれ自分に関わるかだけを知りたいとき。select は同じ値に同じ結果を返す）
   */
  function useValue(): T;
  function useValue<S>(select: (value: T) => S): S;
  function useValue<S>(select?: (value: T) => S): T | S {
    const read = select ?? ((value: T) => value);
    return useSyncExternalStore(
      subscribe,
      () => read(current),
      () => read(initial),
    );
  }

  /** 前の値から次の値を決めるときは関数を渡す（閉じるときに文言を残す、など） */
  function setValue(value: T | ((prev: T) => T)): void {
    current = value instanceof Function ? value(current) : value;
    for (const listener of listeners) listener();
  }

  return [useValue, setValue] as const;
}
