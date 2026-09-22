import Box from '@mui/material/Box';
import Modal from '@mui/material/Modal';
import Paper from '@mui/material/Paper';
import { type PointerEvent, type ReactNode, type RefObject, useEffect, useState } from 'react';
import { clamp } from '../math.ts';

/** 止まる段。閉じる段（画面の外）は状態には持たず、下げきったら onClose で消える */
export type SheetDetent = 'full' | 'peek';

/**
 * 上・下の 2 段で止まるシート（カレンダーのクイック入力）。上の段では画面いっぱいになる。
 * 下の段では後ろの画面をそのまま触れるよう、モーダルにはしない。
 */
type Stepped = {
  /**
   * 下の段でも見えている部分の終わり。この要素の下端までが下の段で画面に残る。
   * 中身は呼び出し側が 1 つの `<form>` にまとめるので、境目だけを ref で受け取る。
   */
  peekRef: RefObject<HTMLElement | null>;
  /** 今の段 */
  detent: SheetDetent;
  onChangeDetent: (detent: SheetDetent) => void;
  /**
   * 後ろの画面を下から覆っている高さ（px）が変わったとき。消えるときは 0 を渡す。
   * 下の段では後ろをそのまま触れるので、覆われた分だけ後ろが自分で余白を作れるようにする。
   */
  onChangeInset?: (inset: number) => void;
  label?: never;
  full?: never;
  onExpand?: never;
};

/**
 * 段を持たないシート（入力フォーム）。中身の高さのまま画面の下に出すので、
 * 中身が短ければ入力欄も操作も画面の下（指の届くところ）に集まる。後ろは暗くして触れなくする。
 */
type Plain = {
  peekRef?: never;
  detent?: never;
  onChangeDetent?: never;
  onChangeInset?: never;
  /** ダイアログとしての名前（読み上げ用）。見出しと同じ文言を渡す */
  label: string;
  /** 中身の高さではなく画面いっぱいで出す（項目が多くて結局画面を覆うフォーム） */
  full?: boolean;
  /**
   * 上へスワイプしたとき。段を持たないシートに「次の段」を決められるのは中身だけなので、
   * 広げるかどうかは呼び出し側に任せる（詳細なら編集に移る = 鉛筆と同じ）。
   * 渡さなければ上へは何も起きない。
   */
  onExpand?: () => void;
};

type Props = {
  /** 出しているか。false のあいだは画面の外に下げる（送信中など。閉じたのとは違うので onClose は呼ばない） */
  open?: boolean;
  /** 下の段からさらに下げたとき。下がりきってから呼ぶ */
  onClose: () => void;
  children: ReactNode;
} & (Stepped | Plain);

/** 段を 1 つ動かすのに要るドラッグ（px）。これに満たなければ元の段に戻す */
const STEP_DISTANCE = 40;
/** 段から段へ滑る時間（ms） */
const SLIDE_MS = 250;
/**
 * 追従を始めるまでの動き（px）。これに満たない間はシートを動かさないので、
 * 入力欄やボタンの上から始めても、タップはそのまま中身に届く。
 */
const DRAG_SLOP = 8;

/** 指の下にある、シートの中で自分でスクロールする所。無ければ null */
function scrollerAt(target: Element, sheet: Element): HTMLElement | null {
  for (let el: Element | null = target; el && el !== sheet; el = el.parentElement) {
    if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight) continue;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return el;
  }
  return null;
}

/** その向きへまだスクロールできるか（下へなぞる = 中身を下ろす = scrollTop を減らす） */
function scrolls(el: HTMLElement, dy: number): boolean {
  return dy > 0 ? el.scrollTop > 0 : el.scrollTop < el.scrollHeight - el.clientHeight;
}

/**
 * 画面の下から出るシート。下へ下げきると閉じる（Google カレンダー方式）。
 * 指に追従して動き、離すと動かした向きへ 1 段ぶん進んで止まる。
 * `peekRef` を渡すと上・下の 2 段で止まり、下の段からさらに下げたときだけ閉じる。
 * 段を持たないシートでは、上へのスワイプは `onExpand` に渡す（中身を広げるのは呼び出し側の仕事）。
 *
 * ドラッグは中身のどこからでも始められる（入力欄やボタンの上も含む。つまむ帯だけでは狭すぎる）。
 * 縦に `DRAG_SLOP` 動かすまではシートを動かさないので、タップや文字の選択は中身に届く。
 * 中身のスクロールもここで面倒を見る: 指の下がまだスクロールできるならそちらを先に動かし、
 * 端まで行ってからシートが動く。ブラウザに任せる（`touch-action: pan-y`）と、スクロールできない
 * 所でもブラウザがなぞりを取り上げて pointercancel を送るため、シートを動かせなくなる。
 *
 * 高さは `translateY` で見える量を変える。段の位置は中身の実測から決めるので、
 * 見出しの高さやキーボードの表示で画面が縮んでも自分で合わせ直す。
 */
export function BottomSheet({
  open = true,
  onClose,
  peekRef,
  detent,
  onChangeDetent,
  onChangeInset,
  label,
  full = false,
  onExpand,
  children,
}: Props) {
  const [sheet, setSheet] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ sheet: 0, peek: 0 });
  /** 指を下ろしてから離すまで。動かし始める（follow が付く）までは中身の操作に任せる */
  const [press, setPress] = useState<{
    pointerId: number;
    /** 指を下ろした位置 */
    x: number;
    y: number;
    /** 指の下にある、自分でスクロールする所（シートより先に動かす） */
    scroller: HTMLElement | null;
    follow: {
      /** 前回の指の位置 */
      last: number;
      /** 今のシートの位置 */
      at: number;
      /** シートに渡した動きの合計（スクロールに使った分は含まない）。段を決めるのに使う */
      moved: number;
    } | null;
  } | null>(null);
  /** 離した瞬間の位置。1 フレームだけ保ってから段へ滑らせる（同じ更新で transition を戻すと効かない） */
  const [released, setReleased] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (released === null) return;
    const frame = requestAnimationFrame(() => setReleased(null));
    return () => cancelAnimationFrame(frame);
  }, [released]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: peekRef は描画のたびに同じ入れ物
  useEffect(() => {
    const peek = peekRef?.current ?? null;
    if (!sheet) return;
    /** 直前に測った高さと、今それを滑らせている最中か（滑っている間は測り直さない） */
    let height = 0;
    let growing = false;
    const measure = () => {
      if (growing) return;
      const next = {
        sheet: sheet.clientHeight,
        peek: peek ? peek.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top : 0,
      };
      // 中身が入れ替わって高さが変わったら、前の高さからその高さへ滑らせる（詳細 → 編集）。
      // height: auto のままでは変化と見なされず transition が効かないので、実測した値で動かす。
      if (height > 0 && next.sheet !== height) {
        growing = true;
        const grow = sheet.animate([{ height: `${height}px` }, { height: `${next.sheet}px` }], {
          duration: SLIDE_MS,
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
  }, [sheet]);

  /** 段ごとの translateY（px）。測る前は画面の外に置き、測れた時点で止まる段まで滑り込ませる */
  const offsets = { full: 0, peek: Math.max(size.sheet - size.peek, 0), closed: size.sheet };
  const measured = size.sheet > 0 && (!peekRef || size.peek > 0);
  const resting = closing || !open || !measured ? offsets.closed : offsets[detent ?? 'full'];

  // 後ろに余白を作らせる高さ。後ろをそのまま使えるのは下の段のときだけで、上の段では覆いきるので 0。
  // 知らせるのは止まる段の高さで、指で動かしている間は変えない（後ろを毎フレーム組み直さない）
  const inset = open && !closing && measured && detent === 'peek' ? size.peek : 0;
  useEffect(() => {
    onChangeInset?.(inset);
    return () => onChangeInset?.(0);
  }, [onChangeInset, inset]);

  /** 下がりきるのを見せてから消す（transitionend は中身の要素の分も来るので時間で待つ） */
  const dismiss = () => {
    setClosing(true);
    setTimeout(onClose, SLIDE_MS);
  };

  /** 指を離したとき。動かしていなければ（タップなら）何もせず、中身に任せたままにする */
  const end = (event: PointerEvent<HTMLElement>) => {
    if (press?.pointerId !== event.pointerId) return;
    const follow = press.follow;
    setPress(null);
    if (!follow) return;
    setReleased(follow.at);
    const moved = follow.moved;
    if (Math.abs(moved) < STEP_DISTANCE) return;
    if (moved < 0) {
      onChangeDetent?.('full');
      onExpand?.();
    } else if (detent === 'full') onChangeDetent?.('peek');
    else dismiss();
  };

  /** ブラウザがスクロールを始めたときなど。段は変えず、今の段へ戻す */
  const cancel = (event: PointerEvent<HTMLElement>) => {
    if (press?.pointerId !== event.pointerId) return;
    if (press.follow) setReleased(press.follow.at);
    setPress(null);
  };

  const paper = (
    <Paper
      ref={setSheet}
      elevation={8}
      data-sheet
      // 段を持たないシートはモーダル。Modal が焦点と Esc を見るので、役割だけを持たせる
      role={peekRef ? undefined : 'dialog'}
      aria-modal={peekRef ? undefined : true}
      aria-label={label}
      onPointerDown={(event) => {
        if (event.button !== 0 || !measured) return;
        if (!(event.target instanceof Element)) return;
        // メニューや入れ子のダイアログは body に出るが、React のツリーの上ではシートの中にある。
        // それらの上の操作をドラッグにすると指を離す先を奪ってしまうので、DOM で中身かを確かめる
        if (!event.currentTarget.contains(event.target)) return;
        // ここではまだ捕まえない。動かさずに離せばタップとして中身に届く
        setPress({
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          scroller: scrollerAt(event.target, event.currentTarget),
          follow: null,
        });
      }}
      onPointerMove={(event) => {
        if (press?.pointerId !== event.pointerId) return;
        if (!press.follow) {
          // 斜め・横の動き（文字の選択など）では始めない。縦にはっきり動いたときだけ追従する
          const dy = event.clientY - press.y;
          if (Math.abs(dy) < DRAG_SLOP || Math.abs(dy) <= Math.abs(event.clientX - press.x)) return;
          // ここで捕まえると、この指の click は中身ではなくシートに向くので、押したことにはならない
          event.currentTarget.setPointerCapture(event.pointerId);
          setPress({ ...press, follow: { last: event.clientY, at: resting, moved: 0 } });
          return;
        }
        const follow = press.follow;
        const dy = event.clientY - follow.last;
        // 指の下がまだスクロールできるなら、シートより先にそちらを動かす
        if (press.scroller && scrolls(press.scroller, dy)) {
          press.scroller.scrollTop -= dy;
          setPress({ ...press, follow: { ...follow, last: event.clientY } });
          return;
        }
        const at = clamp(follow.at + dy, offsets.full, offsets.closed);
        setPress({
          ...press,
          follow: { last: event.clientY, at, moved: follow.moved + dy },
        });
      }}
      onPointerUp={end}
      onPointerCancel={cancel}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        // 2 段のシートは上の段で後ろを覆いきるよう常に画面いっぱい。段が無ければ中身の高さのまま
        height: peekRef || full ? '100dvh' : 'auto',
        maxHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '16px 16px 0 0',
        // 焦点を受け取るのは中身の入力欄なので、シート自身の焦点の枠は出さない（MUI の Dialog と同じ）
        outline: 'none',
        // 画面いっぱいになるので、AppBar や下部ナビより前に出す
        zIndex: (t) => t.zIndex.modal,
        // なぞりはすべて自分で扱う（中のスクロールする所も含む。上の onPointerMove で動かす）。
        // touch-action はスクロールする所で打ち切られるので、中身にも行き渡らせる
        touchAction: 'none',
        '& *': { touchAction: 'none' },
        // 測る前は画面の外に置く（高さが分かってから止まる段まで滑り込ませる）
        transform: measured
          ? `translateY(${press?.follow?.at ?? released ?? resting}px)`
          : 'translateY(100%)',
        // 画面の外に下げた間は読み上げにも残さない。下がりきるまでは見せたいので切り替えだけ遅らせる
        visibility: open ? 'visible' : 'hidden',
        transition: press?.follow
          ? 'none'
          : `transform ${SLIDE_MS}ms ease, visibility 0s ${open ? 0 : SLIDE_MS}ms`,
      }}
    >
      {/* つまんで動かせることを示す横棒。帯のどこからでもドラッグできる */}
      <Box sx={{ py: 1, display: 'flex', justifyContent: 'center', cursor: 'grab' }}>
        <Box aria-hidden sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
      </Box>
      {children}
    </Paper>
  );

  if (peekRef) return paper;
  // 後ろを暗くして触れなくする。焦点の閉じ込め・Esc・背景のスクロール止めも Modal に任せる
  return (
    <Modal open onClose={dismiss}>
      {paper}
    </Modal>
  );
}
