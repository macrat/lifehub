import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import Typography from '@mui/material/Typography';
import { type ComponentType, memo } from 'react';
import { FILL_TEXT } from '../../../../shared/color.ts';
import { CARE_TYPE_LABELS } from '../../../../shared/validation/lemon.ts';
import { SQUIRCLE_CLIP_PATH } from '../../../lib/ui/squircle.ts';
import { useRecordPress } from '../../../lib/ui/use-record-press.ts';
import { wedgeBackground } from '../../../lib/ui/wedge.ts';
import { COMPLETED_TITLE_SX } from '../../events/components/completed-style.ts';
import { LocationLabel, NoteLabel } from '../../events/components/ItemLabels.tsx';
import { TaskCheckbox } from '../../events/components/TaskCheckbox.tsx';
import { CARE_TYPE_ICONS } from '../../lemon/care-type-icons.tsx';
import type { TimelineEntry } from '../queries.ts';
import { type EntryView, useEntryView } from '../use-entry-view.ts';

/** 左の丸の直径（MUI の Avatar と同じ） */
const ICON_SIZE = 40;

/**
 * タスクのスクワークルの一辺。丸と同じ幅だと、角が張り出すぶん丸より大きく見えるので 5% 小さくする
 * （中のチェックの印は丸のアイコンと同じ大きさのまま）。丸と同じ幅の枠の中央に置く
 */
const TASK_ICON_SIZE = ICON_SIZE * 0.95;

/** 行の上下の余白（px） */
const ROW_PADDING_Y = 10;

/** 行の左右の余白（px）。タスクのチェックボックスを重ねる位置もこれで決める */
const ROW_PADDING_X = 16;

/** 左のアイコンの枠。行をまたいで右の文字の左端が揃うよう、幅を決め打ちにする */
const ICON_SLOT_SX = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const;

type Props = {
  entry: TimelineEntry;
  /** 押されたとき。editing は長押し（編集で開く）か */
  onSelect: (entry: TimelineEntry, editing: boolean) => void;
};

/**
 * タイムラインの 1 行（X の投稿と同じ組み方）。左に丸いアイコン、右は上段に名前（タイトル）と薄い字の日時、
 * その下に予定・タスクの場所とメモ（詳細と同じアイコン付き）かレモンの項目のアイコン、下段に中身。無いものの段は詰める。
 * 単押しは閲覧、長押しは編集（`useRecordPress`）。何を出すかは `useEntryView` が決め、ここは並べるだけ。
 *
 * 押せる範囲（ButtonBase）は左のアイコンを含む行全体で、どこを押しても行全体に波紋が広がる。
 * タスクだけは左のアイコンそのものが完了のチェックボックスで、丸ではなくスクワークル（`SQUIRCLE_CLIP_PATH`）の中に
 * チェックの印を出す（押すと完了・未完了が切り替わる）。ボタンの中にボタンは入れられないので、
 * チェックボックスは押せる範囲の外（兄弟）に置き、押せる範囲の中の空けた枠の上に重ねる。
 * こうすると、アイコンを押せば完了が切り替わり、それ以外を押せば行が開いて、波紋はアイコンの下まで広がる。
 */
function TimelineRowView({ entry, onSelect }: Props) {
  const view = useEntryView(entry);
  const press = useRecordPress((editing) => onSelect(entry, editing));
  return (
    <Box sx={{ position: 'relative', borderBottom: 1, borderColor: 'divider' }}>
      <ButtonBase
        {...press}
        sx={{
          width: '100%',
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          gap: 1.5,
          px: `${ROW_PADDING_X}px`,
          py: `${ROW_PADDING_Y}px`,
          textAlign: 'left',
        }}
      >
        <Box sx={ICON_SLOT_SX}>
          {!view.task && <Circle colors={view.colors} icon={view.icon} />}
        </Box>
        <EntryText view={view} />
      </ButtonBase>
      {view.task && (
        <Box
          sx={{
            ...ICON_SLOT_SX,
            position: 'absolute',
            top: ROW_PADDING_Y,
            left: ROW_PADDING_X,
            // 重ねた枠のうちスクワークルの外（角）は、下の行を押したことにする。
            // 枠が押されるとどちらにも反応しない隙間になるので、押せるのはチェックボックスだけにする
            pointerEvents: 'none',
          }}
        >
          <TaskCheckbox
            item={view.task}
            icons={{
              unchecked: (
                <Circle
                  colors={view.colors}
                  icon={CheckBoxOutlineBlankIcon}
                  size={TASK_ICON_SIZE}
                  square
                />
              ),
              checked: (
                <Circle colors={view.colors} icon={CheckBoxIcon} size={TASK_ICON_SIZE} square />
              ),
            }}
            // タスクだけは丸ではなくスクワークル（チェックボックスの四角に合わせた形）。
            // 押せる範囲ごと切り抜くので、中の面も押したときの波紋も同じ形になる
            sx={{ p: 0, clipPath: SQUIRCLE_CLIP_PATH, borderRadius: 0, pointerEvents: 'auto' }}
          />
        </Box>
      )}
    </Box>
  );
}

/** 行の中身は記録が変わらない限り同じなので、ホームの入力（検索窓・シートの開け閉め）のたびに全行を描き直さない */
export const TimelineRow = memo(TimelineRowView);

/**
 * 左の丸。人の色（複数なら塗り分け）の上に白いアイコンを置く。
 * square は角を落とさない四角で、外側で別の形に切り抜くとき（タスクのスクワークル）に使う。
 * size を変えても中のアイコンの大きさは変わらない
 */
function Circle({
  colors,
  icon: Icon,
  size = ICON_SIZE,
  square = false,
}: {
  colors: string[];
  icon: ComponentType<SvgIconProps>;
  size?: number;
  square?: boolean;
}) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: square ? 0 : '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: wedgeBackground(colors),
        color: FILL_TEXT,
      }}
    >
      <Icon fontSize="small" />
    </Box>
  );
}

function EntryText({ view }: { view: EntryView }) {
  return (
    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
      <Stack
        direction="row"
        spacing={1}
        // 上段だけの行は左のアイコンと同じ高さにして、上下の中央で揃える。
        // 下に段があるときは、上段をアイコンの上端に揃えて下へ積む
        sx={{ alignItems: 'center', minHeight: 24, '&:only-child': { minHeight: ICON_SIZE } }}
      >
        <Typography
          variant="subtitle2"
          component="span"
          noWrap
          color={view.overdue ? 'error' : undefined}
          sx={[{ fontWeight: 600 }, view.struck && COMPLETED_TITLE_SX]}
        >
          {view.heading}
        </Typography>
        {view.time && (
          <Typography
            variant="body2"
            component="span"
            color="textSecondary"
            noWrap
            sx={{ flexShrink: 0 }}
          >
            {view.time}
          </Typography>
        )}
      </Stack>
      {view.location && <LocationLabel location={view.location} noWrap />}
      {view.note && <NoteLabel note={view.note} variant="body1" />}
      {view.careTypes.length > 0 && (
        <Stack direction="row" spacing={0.5} sx={{ color: 'text.secondary', py: 0.25 }}>
          {view.careTypes.map((careType) => {
            const CareIcon = CARE_TYPE_ICONS[careType];
            return (
              <CareIcon
                key={careType}
                titleAccess={CARE_TYPE_LABELS[careType]}
                sx={{ fontSize: '1.25rem' }}
              />
            );
          })}
        </Stack>
      )}
      {view.body && (
        <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {view.body}
        </Typography>
      )}
    </Box>
  );
}
