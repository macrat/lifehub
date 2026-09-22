import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import {
  CARE_TYPE_LABELS,
  CARE_TYPES,
  type CareType,
} from '../../../../shared/validation/lemon.ts';
import { formatDatePadded } from '../../../lib/date.ts';
import { CARE_TYPE_ICONS } from '../care-type-icons.tsx';
import type { CareLog } from '../queries.ts';

/** アイコン 1 つの大きさ。枠の幅と揃えて、枠の中に余白が出ないようにする */
const ICON_SIZE = '1.25rem';

type Props = {
  logs: CareLog[];
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかはページが判断する */
  emptyMessage: string;
  /** 行をタップしたとき（詳細を開く） */
  onSelect: (log: CareLog) => void;
};

/**
 * 世話の記録（新しい順）。1 行が 1 回の記録で、その日付・そのときやったこと・メモを 3 列に並べる。
 * 行をタップで詳細（時刻を含む全文、編集・削除はそこに集める）。
 */
export function CareLogList({ logs, emptyMessage, onSelect }: Props) {
  return (
    <List disablePadding>
      {logs.length === 0 && (
        <ListItem>
          <ListItemText secondary={emptyMessage} />
        </ListItem>
      )}
      {logs.map((log) => (
        <ListItem key={log.id} divider disablePadding>
          <ListItemButton
            onClick={() => onSelect(log)}
            sx={{
              // 日付・やったこと・メモの 3 列。前の 2 列は中身の幅ちょうどで、
              // 余った幅はすべてメモが取る。列と列の間はどこも同じ幅になる。
              display: 'grid',
              gridTemplateColumns: 'max-content max-content minmax(0, 1fr)',
              columnGap: 1,
              alignItems: 'center',
            }}
          >
            {/* 桁を揃えた日付（"09/02(水)"）。字数が行ごとに変わると、
                中身の幅で決まる列の右端が動いて、次のアイコンの位置が行ごとにずれる */}
            <Typography variant="body2">{formatDatePadded(log.doneAt)}</Typography>
            <CareTypeIcons careTypes={log.careTypes} />
            <Typography variant="body2" color="text.secondary" noWrap>
              {log.note}
            </Typography>
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}

/**
 * やったことを項目 6 つ分の枠に並べ、やったものだけアイコンを出す。
 * やっていない枠も空けたまま残すので、行をまたいで同じ項目が同じ位置に来て、
 * 一覧を縦に眺めるだけで「いつ何をしたか」の並びが読める。
 */
function CareTypeIcons({ careTypes }: { careTypes: CareType[] }) {
  return (
    <Box
      sx={{
        // 枠はアイコンちょうどの大きさで、間隔は行の 3 列と同じ columnGap にする。
        // こうすると日付・アイコン・メモのどこを見ても隙間が同じ幅になる。
        display: 'grid',
        gridTemplateColumns: `repeat(${CARE_TYPES.length}, ${ICON_SIZE})`,
        columnGap: 1,
        color: 'text.secondary',
      }}
    >
      {CARE_TYPES.map((careType) => {
        const Icon = CARE_TYPE_ICONS[careType];
        return careTypes.includes(careType) ? (
          <Icon
            key={careType}
            titleAccess={CARE_TYPE_LABELS[careType]}
            sx={{ fontSize: ICON_SIZE }}
          />
        ) : (
          <span key={careType} />
        );
      })}
    </Box>
  );
}
