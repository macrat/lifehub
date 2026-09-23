/**
 * 完了したタスクの見え方。リスト表示・ホームの「今日」・カレンダーのグリッドと時間軸で同じにする。
 * 項目（行・ブロック）は薄く、タイトルに取り消し線。グリッドのチップはタイトルが既に薄い色なので、
 * 薄くするのは印だけにする（重ねると文字が読めなくなる）。
 */
export const COMPLETED_SX = { opacity: 0.55 } as const;
export const COMPLETED_TITLE_SX = { textDecoration: 'line-through' } as const;
