import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { type ReactNode, useRef, useState } from 'react';
import { createEventSchema } from '../../../../shared/validation/events.ts';
import { useFormSubmit } from '../../../lib/form.ts';
import { BottomSheet, type SheetDetent } from '../../../lib/ui/BottomSheet.tsx';
import { useDialogHistory } from '../../../lib/ui/dialog-history.ts';
import { SheetHeader } from '../../../lib/ui/RecordSheet.tsx';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import { useIsMobile } from '../../../lib/ui/use-breakpoint.ts';
import { DRAFT_SELECTOR } from '../../calendar/components/DraftBlock.tsx';
import {
  draftFromInstants,
  draftInstants,
  draftText,
  draftValues,
  type EventDraft,
} from '../../calendar/draft.ts';
import type { CalendarItem } from '../../calendar/queries.ts';
import { ParticipantsField } from '../../users/components/ParticipantsField.tsx';
import { eventInputFromForm, type ItemFormValues } from '../form-values.ts';
import type { CreateEventBody } from '../queries.ts';
import { grabbedScope } from '../recurrence-options.ts';
import { EventExtraFields, EventWhenFields, ScopeChip } from './EventFields.tsx';

type Props = {
  /** グリッドで選んだ範囲。日時の既定値になり、上の段で直すとここへ戻す */
  draft: EventDraft;
  /**
   * 直している保存済みの予定（長押しでつまんだもの）。追加のときは null。
   * 入力の既定値になり、保存は呼び出し側（`onSubmit`）が上書きに振り分ける。
   */
  item: CalendarItem | null;
  /** 選んでいる参加者。グリッドの枠もこの色になるので、選択は呼び出し側が持つ */
  participantIds: string[];
  onChangeParticipants: (participantIds: string[]) => void;
  /**
   * なぞり終えて入力できる状態か。PC の吹き出しはドラッグの最中は出さない（枠に重なって選べなくなるため）。
   * スマホのシートは下の段ではグリッドを隠さないので、なぞっている間も出したままにする。
   */
  open: boolean;
  /** 検証を通った値の保存。結果は待つが、画面には楽観的更新で先に反映されている */
  onSubmit: (input: CreateEventBody) => Promise<unknown>;
  /** 上の段で直した日時を下書き（グリッドの枠）へ戻す */
  onChangeDraft: (draft: EventDraft) => void;
  /** PC の「その他のオプション」: 入力済みの内容を引き継いで全項目のフォームへ */
  onExpand: (values: ItemFormValues) => void;
  onClose: () => void;
  /** 開く段。グリッドをなぞったときは下の段、追加ボタンからは上の段（全項目） */
  initialDetent: SheetDetent;
  /**
   * シートがカレンダーを下から覆っている高さ（px）。グリッドはその分だけ下に余白を作る。
   * PC の吹き出しはグリッドの上に浮くだけなので、常に 0 のまま。
   */
  onChangeInset: (inset: number) => void;
};

/**
 * 選んだ範囲に予定を入れるための入力。予定の追加はグリッドをなぞっても追加ボタンからでもここへ来る。
 * 予定を長押しでつまんで直しているとき（`item`）も同じ入力で、既定値がその予定の内容になるだけ。
 * - スマホ: 画面下のシート（`BottomSheet`）。下の段はタイトルと参加者だけ、上の段まで広げると全項目。
 *   ダイアログには移らず、同じシートの見える量が変わるだけ。下げきると下書きごと取り消す。
 * - PC: 選んだ範囲に寄せた吹き出し。タイトルと参加者だけを扱い、残りは「その他のオプション」で
 *   全項目のフォーム（`EventForm`）へ渡す。
 */
export function QuickEventForm({
  draft,
  item,
  participantIds,
  onChangeParticipants,
  open,
  onSubmit,
  onChangeDraft,
  onExpand,
  onClose,
  initialDetent,
  onChangeInset,
}: Props) {
  const isMobile = useIsMobile();
  // 全画面のフォームと同じく、戻る操作では前の画面へ行かず下書きを取り消す
  useDialogHistory(onClose);
  const formRef = useRef<HTMLFormElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  // 段はスマホのシートだけのもの。PC の吹き出しは広がらないので、常に下の段と同じ中身を出す
  const [detent, setDetent] = useState<SheetDetent>(isMobile ? initialDetent : 'peek');
  const initial = draftValues(draft, participantIds, item);
  const [allDay, setAllDay] = useState(initial.allDay);
  // その回だけを直すときは、繰り返しの設定そのものは触らせない（回の行は繰り返さない）
  const thisOnly = grabbedScope(item) === 'this';

  const inputFromForm = (fd: FormData) =>
    eventInputFromForm(fd, { initial, allDay, thisOnly, fallback: draftInstants(draft) });
  const { errors, submitError, submitted, handleSubmit } = useFormSubmit({
    schema: createEventSchema,
    values: inputFromForm,
    onSubmit: (data) =>
      onSubmit({
        ...data,
        startsAt: data.startsAt?.toISOString() ?? null,
        endsAt: data.endsAt?.toISOString() ?? null,
      }),
    onSaved: onClose,
  });

  /** 段の移動。下の段に戻るときは、上の段で直した日時を下書き（テキストとグリッドの枠）へ映す */
  const changeDetent = (next: SheetDetent) => {
    if (next === 'peek' && formRef.current) {
      const { allDay: whole, startsAt, endsAt } = inputFromForm(new FormData(formRef.current));
      const range = startsAt && endsAt && draftFromInstants(whole, startsAt, endsAt);
      if (range) onChangeDraft(range);
    }
    setDetent(next);
  };

  /** PC だけ: 入力済みの内容を引き継いで全項目のフォームへ */
  const expand = () => {
    const input = inputFromForm(new FormData(formRef.current ?? undefined));
    onExpand({ ...initial, title: input.title, participantIds: input.participantIds });
  };

  const peek = (
    <Stack data-sheet-peek ref={peekRef}>
      {/* 保存はスマホでは上端（上の段まで広げても押せるように）、PC は Google カレンダーと同じ右下 */}
      {isMobile ? (
        <SheetHeader onClose={onClose}>
          <SubmitButton />
        </SheetHeader>
      ) : (
        <Stack direction="row" sx={{ px: 1, justifyContent: 'flex-end' }}>
          <IconButton aria-label="閉じる" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      )}
      <Stack spacing={1.5} sx={{ px: 2, pt: 1, pb: 1.5 }}>
        {submitError && <Alert severity="error">{submitError}</Alert>}
        {thisOnly && <ScopeChip scope="this" />}
        <TextField
          name="title"
          label="タイトルを追加"
          defaultValue={initial.title}
          error={Boolean(errors.title)}
          helperText={errors.title}
          autoFocus={!isMobile}
          fullWidth
        />
        {/* 日時は下の段では見出しだけ。上の段には入力欄そのものが出る */}
        {detent === 'peek' && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {draftText(draft)}
          </Typography>
        )}
        <ParticipantsField
          name="participantIds"
          value={participantIds}
          onChange={onChangeParticipants}
          error={errors.participantIds}
        />
        {detent === 'peek' && (
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Button onClick={isMobile ? () => setDetent('full') : expand}>
              その他のオプション
            </Button>
            {!isMobile && <SubmitButton />}
          </Stack>
        )}
      </Stack>
    </Stack>
  );

  if (!isMobile) {
    // 送信したら閉じた見た目にし（入力は残す）、保存できたら呼び出し側がマウントをやめる
    return (
      <Bubble open={open && !submitted} onClose={onClose}>
        <Stack component="form" ref={formRef} onSubmit={handleSubmit} noValidate sx={{ pt: 1 }}>
          {peek}
        </Stack>
      </Bubble>
    );
  }

  return (
    <BottomSheet
      open={!submitted}
      detent={detent}
      onChangeDetent={changeDetent}
      onClose={onClose}
      peekRef={peekRef}
      onChangeInset={onChangeInset}
    >
      <Stack
        component="form"
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        sx={{ flexGrow: 1, minHeight: 0 }}
      >
        {peek}
        {/* 上の段でだけ見える残りの項目。ここは自分でスクロールする（はみ出していればそちらが優先される） */}
        <Stack
          spacing={2}
          sx={{
            flexGrow: 1,
            minHeight: 0,
            overflowY: 'auto',
            px: 2,
            pt: 1,
            pb: 'calc(16px + env(safe-area-inset-bottom))',
          }}
        >
          <EventWhenFields
            // グリッドの端をつまんで範囲を変えたら、入力欄もその日時に入れ直す
            key={`${initial.startsAt}|${initial.endsAt}`}
            initial={initial}
            errors={errors}
            allDay={allDay}
            onChangeAllDay={setAllDay}
          />
          <EventExtraFields initial={initial} errors={errors} thisOnly={thisOnly} />
        </Stack>
      </Stack>
    </BottomSheet>
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
      anchorEl={() => document.querySelector(DRAFT_SELECTOR) ?? document.body}
      anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
      transformOrigin={{ vertical: 'center', horizontal: 'left' }}
      slotProps={{ paper: { sx: { width: 340 } } }}
    >
      {children}
    </Popover>
  );
}
