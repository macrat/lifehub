import ChecklistIcon from '@mui/icons-material/Checklist';
import EventIcon from '@mui/icons-material/Event';
import PaymentsIcon from '@mui/icons-material/Payments';
import SpaIcon from '@mui/icons-material/Spa';
import type { ComponentType } from 'react';

/** 追加ボタン（`AddMenu`）から追加できる種類 */
export type AddKind = 'event' | 'task' | 'expense' | 'lemon';

/** その場でフォームが開く種類（`AddForm`）。予定だけはカレンダーの日表示へ送って下書きを置く */
export type AddFormKind = Exclude<AddKind, 'event'>;

/**
 * 種類ごとの名前とアイコン。追加ボタンの pill と、PWA のショートカットのアイコン
 * （`scripts/generate-icons.ts`）が同じ物を読むので、変えれば両方が揃って変わる。
 * データだけを置く（React を描かない）ので、ビルド時のスクリプトからも読める。
 */
export const ADD_KINDS: Record<AddKind, { label: string; icon: ComponentType }> = {
  event: { label: '予定', icon: EventIcon },
  task: { label: 'タスク', icon: ChecklistIcon },
  expense: { label: '立替', icon: PaymentsIcon },
  lemon: { label: 'レモン', icon: SpaIcon },
};
