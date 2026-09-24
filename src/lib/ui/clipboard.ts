import { notify } from './notice.ts';

/** 文字列をクリップボードに写し、結果を知らせる（`copied` は写せたときの知らせ） */
export async function copyToClipboard(text: string, copied: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notify('info', copied);
  } catch {
    notify('error', 'コピーできませんでした');
  }
}
