import AddIcon from '@mui/icons-material/Add';
import ChecklistIcon from '@mui/icons-material/Checklist';
import EventIcon from '@mui/icons-material/Event';
import PaymentsIcon from '@mui/icons-material/Payments';
import SpaIcon from '@mui/icons-material/Spa';
import Backdrop from '@mui/material/Backdrop';
import SpeedDial, { speedDialClasses } from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import type { SxProps, Theme } from '@mui/material/styles';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { DateString } from '../../../../shared/types.ts';
import { today } from '../../../lib/date.ts';
import { FAB_SX } from '../../../lib/ui/AppShell.tsx';
import { TaskForm } from '../../events/components/TaskForm.tsx';
import { defaultTaskValues } from '../../events/form-values.ts';
import { useCreateEvent } from '../../events/queries.ts';
import { ExpenseForm } from '../../expenses/components/ExpenseForm.tsx';
import { useAddExpense } from '../../expenses/queries.ts';
import { CareLogForm } from '../../lemon/components/CareLogForm.tsx';
import { useLogCare } from '../../lemon/queries.ts';

export type AddKind = 'event' | 'task' | 'expense' | 'lemon';

const ACTIONS: Record<AddKind, { label: string; icon: typeof EventIcon }> = {
  event: { label: '予定', icon: EventIcon },
  task: { label: 'タスク', icon: ChecklistIcon },
  expense: { label: '立替', icon: PaymentsIcon },
  lemon: { label: 'レモン', icon: SpaIcon },
};

/** スクリムと追加ボタンは AppBar・下部ナビ（drawer + 1）より上に出す。展開中は画面全体が暗くなる */
const SCRIM_Z = (t: Theme) => t.zIndex.drawer + 2;

/** 背景はほぼ見えなくなるまで落とす（MUI 既定の 0.5 では暗い配色のときに展開が伝わらない） */
const SCRIM_SX: SxProps<Theme> = { zIndex: SCRIM_Z, bgcolor: 'rgba(0, 0, 0, 0.8)' };

const MENU_SX: SxProps<Theme> = {
  ...FAB_SX,
  zIndex: (t) => SCRIM_Z(t) + 1,
  // ラベルの長さが違っても右端は FAB に揃える（既定の中央揃え・幅揃えにしない）
  alignItems: 'flex-end',
  [`& .${speedDialClasses.actions}`]: {
    alignItems: 'flex-end',
    // 項目どうしは 4px、FAB との間は 8px（既定は 8px / 16px）。
    // 既定の負のマージン（dialRadius = 32px）が下に食い込むぶんを padding に足す
    gap: '4px',
    pb: '40px',
  },
  // 展開すると角丸 16px の四角から円へ変わり、アイコンも + から × になる
  [`& .${speedDialClasses.fab}`]: {
    transition: 'border-radius .2s',
    '&[aria-expanded="true"]': { borderRadius: '50%' },
  },
};

/**
 * ラベル付きの pill。高さ 56px・完全な角丸・左右 24px の余白で、FAB と同じ右端に揃える
 * （extended Fab の既定は高さ 48px・左右 16px）。間隔は MENU_SX 側で決めるのでマージンは持たない。
 * SpeedDialAction 既定の背景（paper）はスクリムに沈むので、浮くグレーにする。
 */
const PILL_SX: SxProps<Theme> = {
  height: 56,
  borderRadius: '28px',
  px: 3,
  gap: 1,
  m: 0,
  bgcolor: 'grey.300',
  color: 'grey.900',
  '&:hover': { bgcolor: 'grey.A100' },
};

type Props = {
  /** 出す順（SpeedDial は下から上に開くので、先頭が一番下） */
  kinds: AddKind[];
  /** 予定の初期日付（時刻は今の次の正時）。無ければ今日。タスクは日時なしで開く */
  date?: DateString;
};

/**
 * 右下の追加ボタン。選んだ種類のフォームをその場で開く。ホームは 4 種、カレンダーは予定・タスクだけ。
 * 予定だけは、選んだ時間帯を見ながら入れたいので、その日の日表示へ送ってそこで下書きを置く
 * （グリッドをなぞって作るのと同じ流れに合流する。カレンダー画面の `add` パラメータ）。
 *
 * 展開したときの見た目は Google カレンダーに揃える: 背景をスクリムで暗くし、アイコンとラベルを収めた
 * pill を右揃えで縦に並べる。ラベルはツールチップではなくボタンの中に出すので、タッチでも読める。
 */
export function AddMenu({ kinds, date }: Props) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<Exclude<AddKind, 'event'> | null>(null);
  const createEvent = useCreateEvent();
  const addExpense = useAddExpense();
  const logCare = useLogCare();
  const close = () => setForm(null);
  const collapse = () => setExpanded(false);
  const open = (kind: AddKind) => {
    collapse();
    if (kind !== 'event') return setForm(kind);
    navigate({
      to: '/calendar',
      search: { view: 'day', date: date ?? today(), add: 'event' },
    });
  };

  return (
    <>
      <Backdrop open={expanded} onClick={collapse} sx={SCRIM_SX} />
      {/* transition.appear を切って、マウント時のズームを止める。タブを移動するたびに
          FAB が出現し直して見えるため。hidden を切り替えたときだけアニメーションする */}
      <SpeedDial
        ariaLabel="追加"
        icon={<SpeedDialIcon icon={<AddIcon />} />}
        open={expanded}
        onOpen={(_, reason) => reason !== 'focus' && setExpanded(true)}
        onClose={collapse}
        slotProps={{ transition: { appear: false } }}
        sx={MENU_SX}
      >
        {kinds.map((kind) => {
          const { label, icon: Icon } = ACTIONS[kind];
          return (
            <SpeedDialAction
              key={kind}
              icon={
                <>
                  <Icon />
                  {label}
                </>
              }
              slotProps={{ fab: { variant: 'extended', sx: PILL_SX } }}
              onClick={() => open(kind)}
            />
          );
        })}
      </SpeedDial>
      {form === 'task' && (
        <TaskForm
          initial={defaultTaskValues()}
          onSubmit={createEvent.mutateAsync}
          onClose={close}
        />
      )}
      {form === 'expense' && <ExpenseForm onSubmit={addExpense.mutateAsync} onClose={close} />}
      {form === 'lemon' && <CareLogForm onSubmit={logCare.mutateAsync} onClose={close} />}
    </>
  );
}
