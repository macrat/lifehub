import Box from '@mui/material/Box';
import type { CalendarItem } from '../../../../shared/calendar.ts';
import type { DateString } from '../../../../shared/types.ts';
import { FILL_HEIGHT, FILL_MARGIN_BOTTOM } from '../../../lib/ui/layout.ts';
import type { Draft } from '../draft.ts';
import type { GridDraft } from '../grid-draft.ts';
import type { PeriodView } from '../use-calendar-page.ts';
import { CalendarPane } from './CalendarPane.tsx';
import { SwipePager } from './SwipePager.tsx';

type Props = {
  view: PeriodView;
  /** スワイプで同時に描く 3 ページ（前・今・次）を代表する日 */
  pages: readonly [DateString, DateString, DateString];
  /** 前後の月・週・日へ（スワイプ） */
  onMove: (direction: 1 | -1) => void;
  onSelectDate: (date: DateString) => void;
  onSelectItem: (item: CalendarItem) => void;
  /** 追加・編集しようとしている予定の枠 */
  draft: GridDraft | null;
  onChangeDraft: (draft: Draft, done: boolean) => void;
  hourHeight: number;
  onZoom: (ratio: number) => void;
  /** 月表示から切り替えてきたか（週・日の最初の縦位置を予定に合わせる） */
  fitItems: boolean;
  /** クイック入力のシートが下から覆っている高さ（px） */
  bottomInset: number;
};

/**
 * 期間で見る表示（月・週・日）。画面の残りを占め、左右のスワイプで前後のページへ移る。
 * 渡す関数は呼び出し側で固定しておくこと（面は props が変わらなければ描き直さない。`CalendarPane` 参照）。
 */
export function PeriodPager({ pages, onMove, draft, bottomInset, ...pane }: Props) {
  return (
    <Box sx={{ height: FILL_HEIGHT, mb: FILL_MARGIN_BOTTOM }}>
      <SwipePager pages={pages} onMove={onMove}>
        {(date, offset) => (
          <CalendarPane
            {...pane}
            date={date}
            // 枠は表示中の面にだけ出す（前後の面は控えなので、同じ枠が二重に出ないように。
            // props が変わらなければ面は描き直さないので、シートの開け閉めや参加者の選択の
            // たびに 3 面とも組み直さずに済む）
            draft={offset === 0 ? draft : null}
            // 枠と同じく、控えの面には渡さない。
            // 覆う高さは下部ナビの分だけ多めに取る: 基準が svh と dvh で食い違っても
            // 足りなくならない側へ倒す（余った分は下の余白が少し増えるだけ）
            bottomInset={offset === 0 ? bottomInset : 0}
          />
        )}
      </SwipePager>
    </Box>
  );
}
