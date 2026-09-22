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
import { formatDate } from '../../../lib/date.ts';
import { CARE_TYPE_ICONS } from '../care-type-icons.tsx';
import type { CareLog } from '../queries.ts';

type Props = {
  logs: CareLog[];
  /** 1 件も無いときの文言。検索で 0 件なのか、まだ 1 件も無いのかはページが判断する */
  emptyMessage: string;
  /** 行をタップしたとき（詳細を開く） */
  onSelect: (log: CareLog) => void;
};

/**
 * 世話の記録（新しい順）。1 行が 1 回の記録で、その日付・そのときやったこと・メモを横に並べる。
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
          <ListItemButton onClick={() => onSelect(log)} sx={{ gap: 1 }}>
            {/* 日付の幅を決め打つ（"9/2(水)" と "12/31(水)" で字数が違う）。
                こうしないと行ごとにアイコンの開始位置がずれ、縦に並べて読めなくなる */}
            <Typography variant="body2" sx={{ flex: 'none', width: '4.5rem' }}>
              {formatDate(log.doneAt)}
            </Typography>
            <CareTypeIcons careTypes={log.careTypes} />
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{ flexGrow: 1, minWidth: 0 }}
            >
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
        flex: 'none',
        display: 'grid',
        gridTemplateColumns: `repeat(${CARE_TYPES.length}, 1.5rem)`,
        justifyItems: 'center',
        color: 'text.secondary',
      }}
    >
      {CARE_TYPES.map((careType) => {
        const Icon = CARE_TYPE_ICONS[careType];
        return careTypes.includes(careType) ? (
          <Icon
            key={careType}
            titleAccess={CARE_TYPE_LABELS[careType]}
            sx={{ fontSize: '1.25rem' }}
          />
        ) : (
          <span key={careType} />
        );
      })}
    </Box>
  );
}
