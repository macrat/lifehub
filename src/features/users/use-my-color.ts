import { useEffect } from 'react';
import { DEFAULT_HUE } from '../../../shared/color.ts';
import { meQueryOptions } from '../../lib/auth.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';
import { previewHue, usePreviewHue } from '../../lib/theme.ts';
import { useUpdateUser } from './queries.ts';

/**
 * 設定画面の「自分の色」。選んでいる最中の色相はテーマが持つ（`lib/theme.ts` の `previewHue`）ので、
 * 選んだ色はその場でアプリ全体のアクセントカラーになり、スイッチや画面上部のインジケータで
 * 実際の見え方を確かめてから決められる。
 *
 * 保存は `save`（保存ボタン）を押したときだけ。スライダーを離した時点では送らない（見比べている
 * 途中の色がそのたびに保存され、他の端末や他のユーザーの画面にも出てしまう）。
 * 使うのをやめた時点（設定画面を離れた時点）で、保存していない色は捨てて保存済みの色に戻す。
 */
export function useMyColor() {
  const { data: me } = useStoreQuery(meQueryOptions);
  const update = useUpdateUser();
  const picked = usePreviewHue();

  // 選んでいる色は、保存済みの色が変わったとき（保存した・保存に失敗して戻った・ほかの端末で変えた）と、
  // 使うのをやめたときに手放して、保存済みの色を出す。手放さないと、失敗して戻っても設定画面にいる間は選んだ色のままになる。
  // WHY NOT 保存ボタンで手放す: 楽観的更新が `me.hue` に届くのは少し後なので、その間だけ前の色が出てちらつく。
  // 保存済みの色が変わった後なら、保存したときは選んだ色と同じなので見た目は変わらない
  // biome-ignore lint/correctness/useExhaustiveDependencies: 保存済みの色が変わった合図だけに使う
  useEffect(() => () => previewHue(null), [me?.hue]);

  const hue = picked ?? me?.hue ?? DEFAULT_HUE;
  return {
    name: me?.name ?? '',
    hue,
    /**
     * 保存できる（＝保存済みの色と違う）か。保存すると楽観的更新で `me.hue` が先に変わるので、
     * 押した時点で保存済みの色と同じになる。失敗すれば保存済みの色に戻る（通知も出る）。
     */
    changed: me != null && hue !== me.hue,
    pick: previewHue,
    save: () => {
      if (me) update.mutate({ id: me.id, hue });
    },
  };
}
