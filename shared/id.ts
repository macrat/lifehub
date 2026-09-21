import { v7 as uuidv7 } from 'uuid';

/**
 * 全テーブル共通の主キー生成（UUID v7: 時系列ソート可能）。
 * 追加する行の ID はクライアントも同じ関数で決めて送る（`shared/validation/*.ts` の作成リクエスト）。
 */
export function newId(): string {
  return uuidv7();
}
