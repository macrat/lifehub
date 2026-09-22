import ChecklistIcon from '@mui/icons-material/Checklist';
import EventIcon from '@mui/icons-material/Event';
import PaymentsIcon from '@mui/icons-material/Payments';
import SpaIcon from '@mui/icons-material/Spa';
import type { ComponentType } from 'react';

/**
 * 追加ボタン（`AddMenu`）から追加できる種類と、その名前・アイコン。
 * ビルド時のスクリプト（Node、DOM 型なし）も読むので、この file に JSX は書かない
 * （アイコンは描かずに持つだけ）。
 */
export const ADD_KINDS = {
  event: { label: '予定', icon: EventIcon },
  task: { label: 'タスク', icon: ChecklistIcon },
  expense: { label: '立替', icon: PaymentsIcon },
  lemon: { label: 'レモン', icon: SpaIcon },
} satisfies Record<string, { label: string; icon: ComponentType }>;

export type AddKind = keyof typeof ADD_KINDS;

/** その場でフォームが開く種類（`AddForm`）。予定だけはカレンダーの日表示へ送って下書きを置く */
export type AddFormKind = Exclude<AddKind, 'event'>;
