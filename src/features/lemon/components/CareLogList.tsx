import Box from '@mui/material/Box';
import List from '@mui/material/List';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import {
  CARE_TYPE_LABELS,
  CARE_TYPES,
  type CareType,
} from '../../../../shared/validation/lemon.ts';
import { formatDatePadded } from '../../../lib/date.ts';
import { HistoryList } from '../../../lib/ui/HistoryList.tsx';
import { RecordListRow } from '../../../lib/ui/RecordListRow.tsx';
import { CARE_TYPE_ICONS } from '../care-type-icons.tsx';
import type { CareLog, useCareLogHistory } from '../queries.ts';

/** アイコン 1 つの大きさ。枠の幅と揃えて、枠の中に余白が出ないようにする */
const ICON_SIZE = '1.25rem';

/**
 * 日付・やったこと・メモの 3 列。前の 2 列は中身の幅ちょうどで、余った幅はすべてメモが取る。
 * 列と列の間はどこも同じ幅（columnGap）になる。
 */
const ROW_SX = {
  display: 'grid',
  gridTemplateColumns: 'max-content max-content minmax(0, 1fr)',
  columnGap: 1,
  alignItems: 'center',
} as const;

/**
 * やったことの枠。アイコンちょうどの大きさの枠を項目の数だけ並べ、
 * 間隔は行の 3 列と同じにするので、日付・アイコン・メモのどこを見ても隙間が同じ幅になる。
 */
const ICONS_SX = {
  display: 'grid',
  gridTemplateColumns: `repeat(${CARE_TYPES.length}, ${ICON_SIZE})`,
  columnGap: 1,
  justifyItems: 'center',
  alignItems: 'center',
  color: 'text.secondary',
} as const;

const ICON_SX = { fontSize: ICON_SIZE } as const;

/** やっていない枠に置く点。アイコンと読み違えない大きさに留める */
const DOT_SX = { width: 2, height: 2, borderRadius: '50%', bgcolor: 'action.disabled' } as const;

type Props = {
  /** 読んだ分の記録（古い順）と、上の端での読み足しなど（`useCareLogHistory`） */
  history: ReturnType<typeof useCareLogHistory>;
  /** 一覧の上に貼り付けておく物（絞り込みのフォームと状況のタイル） */
  header: ReactNode;
  /** 1 件も無いときの文言（`HistoryList`） */
  emptyMessage: string;
  /** 行を押したとき。editing は長押し（編集で開く）か */
  onSelect: (log: CareLog, editing: boolean) => void;
};

/**
 * 世話の記録（上が古く下が新しい）。最初に出す位置は `HistoryList` が決め、上へスクロールすると古いほうのページを
 * 読み足す（`useCareLogHistory`、`HistoryList`）。1 行が 1 回の記録で、その日付・そのときやったこと・
 * メモを 3 列に並べる。行は単押しで閲覧（時刻を含む全文）、長押しで編集（`RecordListRow`）。
 * 削除は詳細の三点リーダーに集める。
 */
export function CareLogList({ history, header, emptyMessage, onSelect }: Props) {
  return (
    <HistoryList history={history} header={header} emptyMessage={emptyMessage}>
      {(logs) => (
        <List disablePadding>
          {logs.map((log) => (
            <RecordListRow key={log.id} sx={ROW_SX} onSelect={(editing) => onSelect(log, editing)}>
              {/* 桁を揃えた日付（"09/02(水)"）。字数が行ごとに変わると、
                  中身の幅で決まる列の右端が動いて、次のアイコンの位置が行ごとにずれる */}
              <Typography variant="body2">{formatDatePadded(log.doneAt)}</Typography>
              <CareTypeIcons careTypes={log.careTypes} />
              <Typography variant="body2" color="text.secondary" noWrap>
                {log.note}
              </Typography>
            </RecordListRow>
          ))}
        </List>
      )}
    </HistoryList>
  );
}

/**
 * やったことを項目 6 つ分の枠に並べ、やったものだけアイコンを出す。
 * やっていない枠も空けたまま残すので、行をまたいで同じ項目が同じ位置に来て、
 * 一覧を縦に眺めるだけで「いつ何をしたか」の並びが読める。
 */
function CareTypeIcons({ careTypes }: { careTypes: CareType[] }) {
  return (
    <Box sx={ICONS_SX}>
      {CARE_TYPES.map((careType) => {
        const Icon = CARE_TYPE_ICONS[careType];
        return careTypes.includes(careType) ? (
          <Icon key={careType} titleAccess={CARE_TYPE_LABELS[careType]} sx={ICON_SX} />
        ) : (
          // ほとんどの記録は葉水か水やりだけなので、空けたままだと枠が穴に見える。
          // 薄い点を置いて「ここにも何かが来ることがある」列だと分かるようにする
          <Box key={careType} sx={DOT_SX} />
        );
      })}
    </Box>
  );
}
