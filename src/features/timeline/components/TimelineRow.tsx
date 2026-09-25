import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { FILL_TEXT } from '../../../../shared/color.ts';
import { CARE_TYPE_LABELS } from '../../../../shared/validation/lemon.ts';
import { useRecordPress } from '../../../lib/ui/use-record-press.ts';
import { wedgeBackground } from '../../../lib/ui/wedge.ts';
import { COMPLETED_TITLE_SX } from '../../events/components/completed-style.ts';
import { CARE_TYPE_ICONS } from '../../lemon/care-type-icons.tsx';
import type { TimelineEntry } from '../queries.ts';
import { useEntryView } from '../use-entry-view.ts';

/** 左の丸の直径（MUI の Avatar と同じ） */
const ICON_SIZE = 40;

type Props = {
  entry: TimelineEntry;
  /** 押されたとき。editing は長押し（編集で開く）か */
  onSelect: (entry: TimelineEntry, editing: boolean) => void;
};

/**
 * タイムラインの 1 行（X の投稿と同じ組み方）。左に丸いアイコン、右は上段に名前と薄い字の日時、
 * 下段に中身。中身が無ければ下段を出さずに 1 行にする。
 * 単押しは閲覧、長押しは編集（`useRecordPress`）。何を出すかは `useEntryView` が決め、ここは並べるだけ。
 */
export function TimelineRow({ entry, onSelect }: Props) {
  const view = useEntryView(entry);
  const press = useRecordPress((editing) => onSelect(entry, editing));
  const Icon = view.icon;
  return (
    <ButtonBase
      {...press}
      sx={{
        width: '100%',
        justifyContent: 'flex-start',
        alignItems: view.body ? 'flex-start' : 'center',
        gap: 1.5,
        px: 2,
        py: 1.25,
        textAlign: 'left',
        borderBottom: 1,
        borderColor: 'divider',
        viewTransitionName: view.transitionName,
      }}
    >
      <Box
        sx={{
          width: ICON_SIZE,
          height: ICON_SIZE,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: wedgeBackground(view.colors),
          color: FILL_TEXT,
        }}
      >
        <Icon fontSize="small" />
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 24 }}>
          {view.names && (
            <Typography variant="subtitle2" component="span" noWrap sx={{ fontWeight: 600 }}>
              {view.names}
            </Typography>
          )}
          {view.careTypes && view.careTypes.length > 0 && (
            <Stack direction="row" spacing={0.5} sx={{ color: 'text.secondary' }}>
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
        {view.body && (
          <Typography
            sx={[
              { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
              view.struck && COMPLETED_TITLE_SX,
            ]}
          >
            {view.body}
          </Typography>
        )}
      </Box>
    </ButtonBase>
  );
}
