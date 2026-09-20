import { createContext, type ReactNode, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * AppBar の中身をページが差し込む仕組み（Portal）。
 * 画面上部の帯を「アプリ名」で浪費せず、そのページの主要な操作（月の切替、検索、登録ボタンなど）に使う。
 * ページは <AppBarContent>…</AppBarContent> を描画するだけでよい。
 */
const SlotContext = createContext<{
  element: HTMLElement | null;
  setElement: (element: HTMLElement | null) => void;
}>({ element: null, setElement: () => {} });

export function AppBarSlotProvider({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  return <SlotContext.Provider value={{ element, setElement }}>{children}</SlotContext.Provider>;
}

/** AppShell が Toolbar の中に置く差し込み先 */
export function AppBarSlotOutlet() {
  const { setElement } = useContext(SlotContext);
  return (
    <div
      ref={setElement}
      style={{ display: 'flex', alignItems: 'center', flexGrow: 1, minWidth: 0, gap: 4 }}
    />
  );
}

/** ページが AppBar に表示したい内容 */
export function AppBarContent({ children }: { children: ReactNode }) {
  const { element } = useContext(SlotContext);
  if (!element) return null;
  return createPortal(children, element);
}
