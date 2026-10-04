import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

/** 描いたまま片付けていないフック（`cleanupHooks` がテストの後に片付ける） */
const mounted = new Set<() => void>();

/**
 * フックを描き、描くたびの戻り値を read で読めるようにする。rerender は props を渡して描き直す（省けば同じ props）。
 * client を渡すと、その QueryClient の下で描く。描いたものはテストの後に片付く（`src/test-setup.ts`）ので、
 * unmount はテストの途中で外すことそのものを確かめるときだけ呼ぶ。
 * WHY 自前: 要るのはフックを描いて戻り値を読むことだけで、React の act と createRoot で足りる
 * （テスト用の描画ライブラリは入れていない）。
 */
export function renderHook<T, P = undefined>(
  hook: (props: P) => T,
  { props, client }: { props?: P; client?: QueryClient } = {},
) {
  let value!: T;
  function Probe({ props }: { props: P }) {
    value = hook(props);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  const rerender = (next = props as P) => {
    const probe = createElement(Probe, { props: next });
    act(() => root.render(client ? createElement(QueryClientProvider, { client }, probe) : probe));
  };
  const unmount = () => {
    if (mounted.delete(unmount)) act(() => root.unmount());
  };
  mounted.add(unmount);
  rerender();
  return { read: () => value, rerender, unmount };
}

/** 描いたまま残っているフックをすべて外す（`src/test-setup.ts` が各テストの後に呼ぶ） */
export function cleanupHooks(): void {
  for (const unmount of mounted) unmount();
}
