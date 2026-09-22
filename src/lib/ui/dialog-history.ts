import { useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

type Router = ReturnType<typeof useRouter>;

/**
 * 履歴の項目が持つ「その時点で開いているダイアログの数」。
 * URL ではなく history の state に持つ: ダイアログが見せている物（選んだ項目、入力途中の値）は
 * URL で表せないので、再読み込みや共有で開き直せる状態ではない。URL を汚さず、項目の深さだけを残す。
 */
type DialogHistoryState = { dialogs?: number };

function depthOf(state: unknown): number {
  return (state as DialogHistoryState).dialogs ?? 0;
}

/** 今開いているダイアログの数。履歴の深さは常にこれに合わせる */
let openCount = 0;
let syncScheduled = false;

/**
 * 履歴の深さを openCount に合わせる。足りなければ項目を積み、余っていればその数だけ戻る。
 * 同じ描画の中での開け閉めは 1 回の操作にまとめる。入れ子のダイアログをまとめて閉じても戻るのは 1 度
 * （back を連打するとブラウザが取りこぼす）、閉じると同時に別のダイアログを開くなら深さは変わらない。
 * StrictMode が効果を 2 度実行しても、差し引きで 1 回の push になる。
 */
function syncHistoryDepth(router: Router): void {
  if (syncScheduled) return;
  syncScheduled = true;
  queueMicrotask(() => {
    syncScheduled = false;
    const diff = openCount - depthOf(router.history.location.state);
    if (diff > 0) {
      // URL は今のまま、履歴の項目だけを積む（背後のページは見えたままなのでスクロール位置も動かさない）
      router.navigate({
        search: true,
        hash: true,
        state: (prev) => ({ ...prev, dialogs: openCount }),
        resetScroll: false,
      });
    } else if (diff < 0) {
      router.history.go(diff);
    }
  });
}

/**
 * ダイアログが開いている間、履歴に項目を 1 つ持たせる。
 * ブラウザバック（iOS の画面端のスワイプを含む）では前の画面へ戻らず、このダイアログだけが閉じる。
 * 画面の操作で閉じたとき（マウントが終わったとき）は、積んだ項目を戻して履歴を元どおりにする。
 * 閉じるのは履歴を渡る操作（戻る・進む）のときだけで、開いたまま同じ画面の中を移動してよい
 * （カレンダーは予定を入力しながら月・週・日を切り替えられる）。新しく積む移動（push・replace）は
 * 自分の項目を消さないので閉じる理由が無く、別の画面への移動ならダイアログごとマウントが終わる。
 * 移動で積んだ項目は深さを持たないので、戻ると移動だけが 1 つずつ取り消され、ダイアログを開く前の
 * 項目まで戻ったところで閉じる。
 *
 * 開いている間はマウントし続けること。閉じた見た目にするだけ（open={false}）では項目は残る
 * （送信中だけ閉じて見せる `RecordSheet` のように、見た目とマウントは別でよい）。
 *
 * ダイアログの中から別の画面へ移る操作は replace で行う（例: 日付の選択ダイアログ）。
 * push するとダイアログの項目が履歴に残り、戻ったときに中身のないダイアログの項目を踏む。
 */
export function useDialogHistory(onClose: () => void): void {
  const router = useRouter();
  // onClose は毎描画で作り直されるので ref に持ち、開いている間は購読を張り直さない
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    const depth = ++openCount;
    syncHistoryDepth(router);
    const unsubscribe = router.history.subscribe(({ location, action }) => {
      // 履歴を渡る操作（戻る・進む）で、自分の項目より手前に移った = 閉じられた
      const traversed = action.type === 'BACK' || action.type === 'FORWARD' || action.type === 'GO';
      if (traversed && depthOf(location.state) < depth) latest.current();
    });
    return () => {
      unsubscribe();
      openCount -= 1;
      syncHistoryDepth(router);
    };
  }, [router]);
}
