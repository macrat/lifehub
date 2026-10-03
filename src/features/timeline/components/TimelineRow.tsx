import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import PushPinIcon from '@mui/icons-material/PushPin';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import Typography from '@mui/material/Typography';
import { type ComponentType, memo } from 'react';
import { FILL_TEXT } from '../../../../shared/color.ts';
import { CARE_TYPE_LABELS } from '../../../../shared/validation/lemon.ts';
import { PressableRow } from '../../../lib/ui/PressableRow.tsx';
import { SQUIRCLE_CLIP_PATH } from '../../../lib/ui/squircle.ts';
import { wedgeBackground } from '../../../lib/ui/wedge.ts';
import { COMPLETED_TITLE_SX } from '../../events/components/completed-style.ts';
import { LocationLink, NoteLabel } from '../../events/components/ItemLabels.tsx';
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

/** 左のアイコンの枠。行をまたいで右の文字の左端が揃うよう、幅を決め打ちにする */
const ICON_SLOT_SX = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const;

/** 行の並べ方。アイコンと文字は上端で揃える（上段だけの行の揃えは `EntryText` が決める） */
const LAYOUT_SX = {
  alignItems: 'flex-start',
  gap: 1.5,
  px: 2,
  py: '10px',
} as const;

/**
 * タスクのチェックボックスの押せる範囲。丸ではなくスクワークル（チェックボックスの四角に合わせた形）で、
 * 押せる範囲ごと切り抜くので、中の面も押したときの波紋も同じ形になる
 */
const TASK_CHECKBOX_SX = { p: 0, clipPath: SQUIRCLE_CLIP_PATH, borderRadius: 0 } as const;

/**
 * 上段（名前と日時）。上段だけの行は左のアイコンと同じ高さにして、上下の中央で揃える。
 * 下に段があるときは、上段をアイコンの上端に揃えて下へ積む
 */
const HEADING_SX = {
  alignItems: 'center',
  minHeight: 24,
  '&:only-child': { minHeight: ICON_SIZE },
} as const;

type Props = {
  entry: TimelineEntry;
  /** 押されたとき。editing は長押し（編集で開く）か */
  onSelect: (entry: TimelineEntry, editing: boolean) => void;
};

/**
 * タイムラインの 1 行（X の投稿と同じ組み方）。左に丸いアイコン、右は上段に名前（タイトル）と薄い字の日時、
 * その下に予定・タスクの場所とメモ（詳細と同じアイコン付き）かレモンの項目のアイコン、下段に中身。無いものの段は詰める。
 * 何を出すかは `useEntryView` が決め、ここは並べるだけ。
 * 押し方（アイコンを含む行全体が押せる範囲、単押しは閲覧、長押しは編集）は `PressableRow` が決める。
 * 場所はアイコンと文字だけが地図を開くリンクで、狭い画面でも行の残りを押せば予定が開く。
 * タスクだけは左のアイコンそのものが完了のチェックボックスで、丸ではなくスクワークル（`SQUIRCLE_CLIP_PATH`）の中に
 * チェックの印を出す（押すと完了・未完了が切り替わる）。
 */
function TimelineRowView({ entry, onSelect }: Props) {
  const view = useEntryView(entry);
  return (
    <PressableRow
      onSelect={(editing) => onSelect(entry, editing)}
      mark={!view.task && <Circle colors={view.colors} icon={view.icon} />}
      control={
        view.task && (
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
            sx={TASK_CHECKBOX_SX}
          />
        )
      }
      markSx={ICON_SLOT_SX}
      layoutSx={LAYOUT_SX}
      divider
      moveKey={entry.id}
    >
      <EntryText view={view} />
    </PressableRow>
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
      <Stack direction="row" spacing={1} sx={HEADING_SX}>
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
        {view.pinned && (
          // 一番上に固定している理由だけを示す。日時と同じ薄い色で、字より小さくして目立たせない
          <PushPinIcon
            titleAccess="ピン止め"
            sx={{ fontSize: '0.875rem', color: 'text.secondary', flexShrink: 0 }}
          />
        )}
      </Stack>
      {view.location && <LocationLink location={view.location} noWrap />}
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
