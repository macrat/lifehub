import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { type ReactNode, useRef } from 'react';
import { createEventSchema } from '../../../../shared/validation/events.ts';
import { formList, formText, useFormSubmit } from '../../../lib/form.ts';
import { useDialogHistory } from '../../../lib/ui/dialog-history.ts';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import { useIsMobile } from '../../../lib/ui/use-breakpoint.ts';
import { useSwipe } from '../../../lib/use-swipe.ts';
import { draftInstants, draftText, draftValues, type EventDraft } from '../../calendar/draft.ts';

import { ParticipantsField } from '../../users/components/ParticipantsField.tsx';
import type { ItemFormValues } from '../form-values.ts';
import type { CreateEventBody } from '../queries.ts';

type Props = {
  /** グリッドで選んだ範囲。日時はこれで決まり、ここでは変えない（調整はグリッドの端をつまむ） */
  draft: EventDraft;
  /**
   * なぞり終えて入力できる状態か。PC の吹き出しはドラッグの最中は出さない（枠に重なって選べなくなるため）。
   * スマホのシートは画面の下に出るだけでグリッドを隠さないので、なぞっている間も出したままにする。
   */
  open: boolean;
  /** 検証を通った値の保存。結果は待つが、画面には楽観的更新で先に反映されている */
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  /** 「その他のオプション」・上へのスワイプ: 入力済みの内容を引き継いで全項目のフォームへ */
  onExpand: (values: ItemFormValues) => void;
  onClose: () => void;
};

/**
 * グリッドで選んだ範囲にすぐ予定を入れるための最小のフォーム（Google カレンダーのクイック入力）。
 * スマホは画面下のシート、PC は選んだ範囲に寄せた吹き出しで出す。日時は選んだ範囲そのままで、
 * 足りない項目は「その他のオプション」（スマホは上へのスワイプでも）で全項目のフォームに引き継ぐ。
 */
export function QuickEventForm({ draft, open, onSubmit, onExpand, onClose }: Props) {
  const isMobile = useIsMobile();
  // 全画面のフォームと同じく、戻る操作では前の画面へ行かず下書きを取り消す
  useDialogHistory(onClose);
  const formRef = useRef<HTMLFormElement>(null);
  const { errors, submitError, submitted, handleSubmit } = useFormSubmit({
    schema: createEventSchema,
    values: (fd) => ({
      kind: 'event',
      ...draftInstants(draft),
      title: formText(fd, 'title') ?? '',
      participantIds: formList(fd, 'participantIds'),
      location: null,
      note: null,
      rrule: null,
      remindStartMinutes: null,
      remindEndMinutes: null,
    }),
    onSubmit: (data) =>
      onSubmit({
        ...data,
        startsAt: data.startsAt?.toISOString() ?? null,
        endsAt: data.endsAt?.toISOString() ?? null,
      }),
    onSaved: onClose,
  });

  /** 入力済みの内容を引き継いで全項目のフォームへ */
  const expand = () => {
    const fd = formRef.current ? new FormData(formRef.current) : new FormData();
    onExpand({
      ...draftValues(draft),
      title: formText(fd, 'title') ?? '',
      participantIds: formList(fd, 'participantIds'),
    });
  };

  const save = <SubmitButton />;
  const content = (
    <Stack
      component="form"
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      spacing={1.5}
      sx={{ p: 2, pt: 1, width: isMobile ? 'auto' : 340 }}
    >
      {/* 保存はスマホでは上端（シートの外に出ないよう）、PC は Google カレンダーと同じ右下に置く */}
      <Stack
        direction={isMobile ? 'row' : 'row-reverse'}
        sx={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <IconButton aria-label="閉じる" onClick={onClose}>
          <CloseIcon />
        </IconButton>
        {isMobile && save}
      </Stack>
      {submitError && <Alert severity="error">{submitError}</Alert>}
      <TextField
        name="title"
        label="タイトルを追加"
        error={Boolean(errors.title)}
        helperText={errors.title}
        autoFocus={!isMobile}
        fullWidth
      />
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {draftText(draft)}
      </Typography>
      <ParticipantsField name="participantIds" defaultValue={[]} error={errors.participantIds} />
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Button onClick={expand}>その他のオプション</Button>
        {!isMobile && save}
      </Stack>
    </Stack>
  );

  // 送信したら閉じた見た目にし（入力は残す）、保存できたら呼び出し側がマウントをやめる
  return isMobile ? (
    <Sheet open={!submitted} onExpand={expand} onClose={onClose}>
      {content}
    </Sheet>
  ) : (
    <Bubble open={open && !submitted} onClose={onClose}>
      {content}
    </Bubble>
  );
}

/**
 * スマホ: グリッドを隠さず、下に重ねて出す（画面の上半分で範囲を調整しながら入力できる）。
 * 上へスワイプすると全項目のフォームへ広がり、下へスワイプすると下書きごと取り消す。
 */
function Sheet({
  open,
  onExpand,
  onClose,
  children,
}: {
  open: boolean;
  onExpand: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useSwipe(ref, { onSwipeUp: onExpand, onSwipeDown: onClose });
  return (
    <Drawer
      anchor="bottom"
      open={open}
      variant="persistent"
      slotProps={{
        paper: { sx: { borderRadius: '16px 16px 0 0', pb: 'env(safe-area-inset-bottom)' } },
      }}
    >
      <Box ref={ref}>
        {/* つまんで動かせることを示す横棒。操作はシートのどこからでもできる */}
        <Box
          aria-hidden
          sx={{ mx: 'auto', mt: 1, width: 32, height: 4, borderRadius: 2, bgcolor: 'divider' }}
        />
        {children}
      </Box>
    </Drawer>
  );
}

/** PC: 選んだ範囲に寄せた吹き出し。外側をクリックすると Google カレンダーと同じく下書きを捨てる */
function Bubble({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorEl={() => document.querySelector('[data-draft]') ?? document.body}
      anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
      transformOrigin={{ vertical: 'center', horizontal: 'left' }}
    >
      {children}
    </Popover>
  );
}
