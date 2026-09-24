import { type RefObject, useEffect, useEffectEvent } from 'react';

/**
 * 画面の上に浮かぶ物（モーダルにしない吹き出し）の外で押されたら閉じる。背景（backdrop）で押し込みを
 * 受ける代わりに、文書全体の pointerdown を先取りして、その押し込みを下の画面には渡さない
 * （グリッドのように押した時点で動き出す物を、閉じるための押し込みで動かさない）。
 * `ignore` に当たる要素は外とみなさず、押し込みもそのまま渡す（吹き出しを開いたまま触らせたい物）。
 * WHY NOT モーダルの背景: 背景は画面全体を覆うので、その下にある物（`ignore`）にも触れなくなる。
 * WHY NOT MUI の ClickAwayListener: 文書で受けるのが React より後なので、下の画面の pointerdown が
 * 先に動き出してしまう（グリッドなら押した所から新しい範囲を選び始める）。
 */
export function usePressOutside(
  ref: RefObject<HTMLElement | null>,
  { enabled, ignore, onPress }: { enabled: boolean; ignore: string; onPress: () => void },
) {
  const press = useEffectEvent(onPress);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    document.addEventListener(
      'pointerdown',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (ref.current?.contains(target) || target.closest(ignore)) return;
        event.stopPropagation();
        press();
      },
      // 捕獲で受けて、React（描画先の根で受ける）より先に止める
      { capture: true, signal: controller.signal },
    );
    return () => controller.abort();
  }, [ref, enabled, ignore]);
}
