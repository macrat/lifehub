import ChecklistIcon from '@mui/icons-material/Checklist';
import EditIcon from '@mui/icons-material/Edit';
import EventIcon from '@mui/icons-material/Event';
import PaymentsIcon from '@mui/icons-material/Payments';
import SpaIcon from '@mui/icons-material/Spa';
import type { ComponentType } from 'react';
import type { AddKind } from '../../lib/add-pages.ts';

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
  memo: { label: 'メモ', icon: EditIcon },
} satisfies Record<AddKind, { label: string; icon: ComponentType }>;

/** その場でフォームが開く種類（`AddForm`）。予定だけはカレンダーに下書きを置く */
export type AddFormKind = Exclude<AddKind, 'event'>;
