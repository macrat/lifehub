import { type RefObject, useEffect, useState } from 'react';

/** シートの高さと、下の段で見せる部分の高さ（px）。測る前は 0 */
type SheetSize = { sheet: number; peek: number };

/**
 * シートの高さを測り続ける。段の位置は中身の実測から決めるので、
 * 見出しの高さやキーボードの表示で画面が縮んでも測り直して知らせる。
 *
 * 中身が入れ替わって高さが変わったら、前の高さからその高さへ `slideMs` かけて滑らせる（詳細 → 編集）。
 * height: auto のままでは変化と見なされず transition が効かないので、実測した値で動かす。
 * 滑っている間は測り直さない（途中の高さを段の位置にしない）。
 */
export function useSheetSize(
  sheet: HTMLElement | null,
  peekRef: RefObject<HTMLElement | null> | undefined,
  slideMs: number,
): SheetSize {
  const [size, setSize] = useState<SheetSize>({ sheet: 0, peek: 0 });

  // biome-ignore lint/correctness/useExhaustiveDependencies: peekRef は描画のたびに同じ入れ物
  useEffect(() => {
    const peek = peekRef?.current ?? null;
    if (!sheet) return;
    /** 直前に測った高さと、今それを滑らせている最中か */
    let height = 0;
    let growing = false;
    const measure = () => {
      if (growing) return;
      const next = {
        sheet: sheet.clientHeight,
        peek: peek ? peek.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top : 0,
      };
      if (height > 0 && next.sheet !== height) {
        growing = true;
        const grow = sheet.animate([{ height: `${height}px` }, { height: `${next.sheet}px` }], {
          duration: slideMs,
          easing: 'ease',
        });
        grow.finished.finally(() => {
          growing = false;
        });
      }
      height = next.sheet;
      setSize(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    if (peek) observer.observe(peek);
    return () => observer.disconnect();
  }, [sheet, slideMs]);

  return size;
}
