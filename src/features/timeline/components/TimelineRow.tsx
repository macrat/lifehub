import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import Typography from '@mui/material/Typography';
import type { ComponentType } from 'react';
import { FILL_TEXT } from '../../../../shared/color.ts';
import { CARE_TYPE_LABELS } from '../../../../shared/validation/lemon.ts';
import { useRecordPress } from '../../../lib/ui/use-record-press.ts';
import { wedgeBackground } from '../../../lib/ui/wedge.ts';
import { COMPLETED_TITLE_SX } from '../../events/components/completed-style.ts';
import { TaskCheckbox } from '../../events/components/TaskCheckbox.tsx';
import { CARE_TYPE_ICONS } from '../../lemon/care-type-icons.tsx';
import type { TimelineEntry } from '../queries.ts';
import { type EntryView, useEntryView } from '../use-entry-view.ts';

/** 左の丸の直径（MUI の Avatar と同じ） */
const ICON_SIZE = 40;

/** 行の上下の余白（px）。左のチェックボックスを押せる範囲の外に重ねるので、同じ値で揃える */
const ROW_PADDING_Y = 10;

type Props = {
  entry: TimelineEntry;
  /** 押されたとき。editing は長押し（編集で開く）か */
  onSelect: (entry: TimelineEntry, editing: boolean) => void;
};

/**
 * タイムラインの 1 行（X の投稿と同じ組み方）。左に丸いアイコン、右は上段に名前（タイトル）と薄い字の日時、
 * その下にレモンの項目のアイコン、下段に中身。無いものの段は詰める。
 * 単押しは閲覧、長押しは編集（`useRecordPress`）。何を出すかは `useEntryView` が決め、ここは並べるだけ。
 * タスクは丸そのものが完了のチェックボックスで、中にチェックの印を出す（押すと完了・未完了が切り替わる）。
 * 押せる範囲（ButtonBase）の中にボタンを入れられないので、押せる範囲には同じ大きさの空きを取り、
 * チェックボックスはその上に重ねる（リストの行の `MarkedRow` と同じ考え方）。
 */
export function TimelineRow({ entry, onSelect }: Props) {
  const view = useEntryView(entry);
  const press = useRecordPress((editing) => onSelect(entry, editing));
  const multiline = view.body !== null || view.careTypes.length > 0;
  return (
    <Box
      sx={{
        position: 'relative',
        borderBottom: 1,
        borderColor: 'divider',
        viewTransitionName: view.transitionName,
      }}
    >
      <ButtonBase
        {...press}
        sx={{
          width: '100%',
          justifyContent: 'flex-start',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 1.5,
          px: 2,
          py: `${ROW_PADDING_Y}px`,
          textAlign: 'left',
        }}
      >
        {view.task ? (
          <Box sx={{ width: ICON_SIZE, height: ICON_SIZE, flexShrink: 0 }} />
        ) : (
          <EntryIcon view={view} />
        )}
        <EntryText view={view} />
      </ButtonBase>
      {view.task && (
        <Box
          sx={{
            position: 'absolute',
            left: 16,
            width: ICON_SIZE,
            height: ICON_SIZE,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...(multiline ? { top: ROW_PADDING_Y } : { top: '50%', transform: 'translateY(-50%)' }),
          }}
        >
          <TaskCheckbox
            item={view.task}
            icons={{
              unchecked: <Circle colors={view.colors} icon={CheckBoxOutlineBlankIcon} />,
              checked: <Circle colors={view.colors} icon={CheckBoxIcon} />,
            }}
          />
        </Box>
      )}
    </Box>
  );
}

function EntryIcon({ view }: { view: EntryView }) {
  return <Circle colors={view.colors} icon={view.icon} />;
}

/** 左の丸。人の色（複数なら塗り分け）の上に白いアイコンを置く */
function Circle({ colors, icon: Icon }: { colors: string[]; icon: ComponentType<SvgIconProps> }) {
  return (
    <Box
      sx={{
        width: ICON_SIZE,
        height: ICON_SIZE,
        flexShrink: 0,
        borderRadius: '50%',
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
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 24 }}>
        <Typography
          variant="subtitle2"
          component="span"
          noWrap
          sx={[{ fontWeight: 600 }, view.struck && COMPLETED_TITLE_SX]}
        >
          {view.heading}
        </Typography>
        {view.time && (
          <Typography
            variant="body2"
            component="span"
            color="text.secondary"
            noWrap
            sx={{ flexShrink: 0 }}
          >
            {view.time}
          </Typography>
        )}
      </Stack>
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
