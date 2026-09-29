import ChecklistIcon from '@mui/icons-material/Checklist';
import EditIcon from '@mui/icons-material/Edit';
import EventIcon from '@mui/icons-material/Event';
import PaymentsIcon from '@mui/icons-material/Payments';
import SpaIcon from '@mui/icons-material/Spa';
import type { ComponentType } from 'react';
import type { AddKind } from './add-pages.ts';

/**
 * 追加できる種類と、その名前・アイコン（追加ボタン・タイムライン・ショートカットの絵が同じ物を使う）。
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
