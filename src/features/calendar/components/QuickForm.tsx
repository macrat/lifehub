import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grow from '@mui/material/Grow';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { type FormEventHandler, type ReactNode, type RefObject, useRef, useState } from 'react';
import { BottomSheet, type SheetDetent } from '../../../lib/ui/BottomSheet.tsx';
import { useDialogHistory } from '../../../lib/ui/dialog-history.ts';
import { SheetHeader } from '../../../lib/ui/RecordSheet.tsx';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import { useIsMobile } from '../../../lib/ui/use-breakpoint.ts';
import { usePressOutside } from '../../../lib/ui/use-press-outside.ts';
import { ExtraFields, ScopeChip, WhenFields } from '../../events/components/EventFields.tsx';
import { ParticipantsField } from '../../users/components/ParticipantsField.tsx';
import type { GridDraft, QuickProps } from '../use-event-composer.ts';
import type { Quick } from '../use-quick-form.ts';
import { DRAFT_SELECTOR } from './markers.ts';

type Props = Pick<QuickProps, 'onExpand'> & {
  /**
   * グリッドの下書き。`item` は直している保存済みの予定・タスク（長押しでつまんだもの。追加のときは null）。
   * 参加者はグリッドの枠の色にもなるので呼び出し側が持つ。
   * `settled`（なぞり終えた）までは PC の吹き出しを隠す（枠に重なって選べなくなるため）。
   * スマホのシートは下の段ではグリッドを隠さないので、なぞっている間も出したままにする。
   * `origin` は入力を始めた所で、開く段とタイトルに焦点を当てるかを決める。
   */
  draft: GridDraft;
  quick: Quick;
  /** 予定かタスクか。スマホで上の段まで広げたときだけ見える残りの項目（日時・場所・メモ・繰り返し・通知）が違う */
  kind: 'event' | 'task';
  onChangeParticipants: (participantIds: string[]) => void;
  onClose: () => void;
  /**
   * シートがカレンダーを下から覆っている高さ（px）。グリッドはその分だけ下に余白を作る。
   * PC の吹き出しはグリッドの上に浮くだけなので、常に 0 のまま。
   */
  onChangeInset: (inset: number) => void;
};

/**
 * グリッドの下書きを入力するクイック入力の入れ物。予定（`QuickEventForm`）とタスク（`QuickTaskForm`）で同じもので、
 * 端末に合った入れ物を選ぶ。
 * - スマホ: 画面下のシート（`QuickSheet`）。下の段はタイトル・日時の見出し・参加者だけ、上の段まで広げると全項目。
 * - PC: 選んだ範囲に寄せた吹き出し（`QuickBubble`）。タイトルと参加者だけを扱い、残りは
 *   「その他のオプション」で全項目のフォームへ渡す。
 */
export function QuickForm({ onExpand, ...props }: Props) {
  const isMobile = useIsMobile();
  // 全画面のフォームと同じく、戻る操作では前の画面へ行かず下書きを取り消す
  useDialogHistory(props.onClose);
  return isMobile ? (
    <QuickSheet {...props} />
  ) : (
    <QuickBubble {...props} onExpand={() => onExpand(props.quick.expandValues())} />
  );
}

type LayoutProps = Omit<Props, 'kind' | 'onChangeInset' | 'onExpand'>;

/**
 * スマホ: 画面下のシート（`BottomSheet`）。ダイアログには移らず、同じシートの見える量が変わるだけ。
 * 下げきると下書きごと取り消す。保存は上端（上の段まで広げても押せるように）。
 * 段はこのシートだけのもので、開く段は入口（`draft.origin`）で決まる（グリッドからは下の段、追加ボタンからは上の段）。
 * 追加ボタン（予定だけ）から開いたときは、予定には必ずタイトルを入れるのでタイトルに焦点を当てる。
 * グリッドをなぞって開いたときは、まだ日時を選び直しているかもしれないので当てない。
 */
function QuickSheet({
  kind,
  draft,
  quick,
  onChangeParticipants,
  onClose,
  onChangeInset,
}: Omit<Props, 'onExpand'>) {
  const peekRef = useRef<HTMLDivElement>(null);
  const [detent, setDetent] = useState<SheetDetent>(draft.origin === 'add' ? 'full' : 'peek');
  const { form } = quick;
  /** 段の移動。下の段に戻るときは、上の段で直した日時を下書き（見出しとグリッドの枠）へ映す */
  const changeDetent = (next: SheetDetent) => {
    if (next === 'peek') quick.syncDraft();
    setDetent(next);
  };
  return (
    <BottomSheet
      open={!form.submitted}
      detent={detent}
      onChangeDetent={changeDetent}
      onClose={onClose}
      peekRef={peekRef}
      onChangeInset={onChangeInset}
    >
      <QuickFormBox
        formRef={quick.formRef}
        onSubmit={form.handleSubmit}
        sx={{ flexGrow: 1, minHeight: 0 }}
      >
        <Stack ref={peekRef}>
          <SheetHeader onClose={onClose}>
            <SubmitButton />
          </SheetHeader>
          <QuickFields
            form={form}
            title={quick.initial.title}
            autoFocus={draft.origin === 'add'}
            rangeText={detent === 'peek' ? quick.rangeText : null}
            participantIds={draft.participantIds}
            onChangeParticipants={onChangeParticipants}
          >
            <Button onClick={() => changeDetent('full')}>その他のオプション</Button>
          </QuickFields>
        </Stack>
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
          <WhenFields
            kind={kind}
            // 枠を動かしたら、入力欄もその日時に入れ直す
            key={`${quick.initial.startsAt}|${quick.initial.endsAt}`}
            initial={quick.initial}
            errors={form.errors}
            allDay={quick.allDay}
            onChangeAllDay={quick.changeAllDay}
          />
          <ExtraFields
            kind={kind}
            initial={quick.initial}
            errors={form.errors}
            allDay={quick.allDay}
            thisOnly={form.thisOnly}
          />
        </Stack>
      </QuickFormBox>
    </BottomSheet>
  );
}

/**
 * 吹き出しを寄せる先。測るたびに今出ている枠を探す（枠は動かすたびに場所が変わり、月表示では週ごとの
 * 帯に入れ替わる）。同じ物を渡し続けるので、Popper は開くたびにだけ位置を測り直す。
 */
const draftAnchor = {
  getBoundingClientRect: () =>
    (document.querySelector(DRAFT_SELECTOR) ?? document.body).getBoundingClientRect(),
};

/**
 * PC: 選んだ範囲に寄せた吹き出し。外側を押すと Google カレンダーと同じく下書きを捨てる。
 * 開いたままグリッドの枠をつまんで直せるよう、モーダルにしない（Popover の背景は画面全体を覆い、
 * 枠にも触れなくなる）。外を押したことは `usePressOutside` で知り、枠を押したときは閉じない。
 * なぞっている間（`settled` でない）は枠に重ならないよう隠し、離したら枠の新しい場所に寄せ直す。
 * 隠す間も入力を残すため、中身はマウントしたままにし（`keepMounted`）、開き終えるたびにタイトルに
 * 焦点を戻す（autoFocus は最初のマウントでしか効かず、そのときは隠れている）。
 * 送信したら閉じた見た目にし（入力は残す）、保存できたら呼び出し側がマウントをやめる。
 * 広がらないので、中身はいつもスマホの下の段と同じ。保存は Google カレンダーと同じ右下。
 */
function QuickBubble({
  draft,
  quick,
  onChangeParticipants,
  onClose,
  onExpand,
}: LayoutProps & { onExpand: () => void }) {
  const { form } = quick;
  const paperRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const open = draft.settled && !form.submitted;
  usePressOutside(paperRef, { enabled: open, ignore: DRAFT_SELECTOR, onPress: onClose });
  return (
    <Popper
      open={open}
      anchorEl={draftAnchor}
      placement="right"
      keepMounted
      transition
      sx={{ zIndex: 'modal' }}
    >
      {({ TransitionProps }) => (
        <Grow {...TransitionProps} onEntered={() => titleRef.current?.focus()}>
          <Paper
            ref={paperRef}
            elevation={8}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
            sx={{ width: 340 }}
          >
            <QuickFormBox formRef={quick.formRef} onSubmit={form.handleSubmit} sx={{ pt: 1 }}>
              <Stack direction="row" sx={{ px: 1, justifyContent: 'flex-end' }}>
                <IconButton aria-label="閉じる" onClick={onClose}>
                  <CloseIcon />
                </IconButton>
              </Stack>
              <QuickFields
                form={form}
                title={quick.initial.title}
                titleRef={titleRef}
                rangeText={quick.rangeText}
                participantIds={draft.participantIds}
                onChangeParticipants={onChangeParticipants}
              >
                <Button onClick={onExpand}>その他のオプション</Button>
                <SubmitButton />
              </QuickFields>
            </QuickFormBox>
          </Paper>
        </Grow>
      )}
    </Popper>
  );
}

/** 入力全体を包む form。保存の送信と、入力欄の値を読み出す先（`formRef`）になる */
function QuickFormBox({
  formRef,
  onSubmit,
  sx,
  children,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  sx: SxProps<Theme>;
  children: ReactNode;
}) {
  return (
    <Stack component="form" ref={formRef} onSubmit={onSubmit} noValidate sx={sx}>
      {children}
    </Stack>
  );
}

/**
 * 下の段（PC は吹き出しの全体）の中身: タイトル・日時の見出し・参加者と、最後の行の操作（`children`）。
 * 日時は下の段では見出しだけで、上の段には入力欄そのものが出る。見出しと操作は下の段でだけ出す
 * （`rangeText` が null なら上の段）。
 */
function QuickFields({
  form,
  title,
  titleRef,
  autoFocus = false,
  rangeText,
  participantIds,
  onChangeParticipants,
  children,
}: {
  form: Pick<Quick['form'], 'errors' | 'submitError' | 'thisOnly'>;
  title: string;
  /** タイトルの入力欄。焦点を置くときに使う */
  titleRef?: RefObject<HTMLInputElement | null>;
  /** 出た所でタイトルに焦点を当てるか */
  autoFocus?: boolean;
  rangeText: string | null;
  participantIds: string[];
  onChangeParticipants: (participantIds: string[]) => void;
  children: ReactNode;
}) {
  return (
    <Stack spacing={1.5} sx={{ px: 2, pt: 1, pb: 1.5 }}>
      {form.submitError && <Alert severity="error">{form.submitError}</Alert>}
      {form.thisOnly && <ScopeChip scope="this" />}
      <TextField
        name="title"
        label="タイトルを追加"
        defaultValue={title}
        inputRef={titleRef}
        autoFocus={autoFocus}
        error={Boolean(form.errors.title)}
        helperText={form.errors.title}
        fullWidth
      />
      {rangeText !== null && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {rangeText}
        </Typography>
      )}
      <ParticipantsField
        name="participantIds"
        value={participantIds}
        onChange={onChangeParticipants}
        error={form.errors.participantIds}
      />
      {rangeText !== null && (
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          {children}
        </Stack>
      )}
    </Stack>
  );
}
