import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * フックを描き、描くたびの戻り値を read で読めるようにする。rerender は props を渡して描き直す。
 * client を渡すと、その QueryClient の下で描く。
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
  const rerender = (next: P) => {
    const probe = createElement(Probe, { props: next });
    act(() => root.render(client ? createElement(QueryClientProvider, { client }, probe) : probe));
  };
  rerender(props as P);
  return { read: () => value, rerender, unmount: () => act(() => root.unmount()) };
}
