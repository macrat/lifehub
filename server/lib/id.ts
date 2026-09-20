import { v7 as uuidv7 } from 'uuid';

/** 全テーブル共通の主キー生成（UUID v7: 時系列ソート可能） */
export function newId(): string {
  return uuidv7();
}
