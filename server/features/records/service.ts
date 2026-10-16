import type { RecordInput } from '../../../shared/validation/records.ts';
import { logCare } from '../lemon/service.ts';

/**
 * 記録投入用エンドポイントの受け付け。`type` で振り分けて、その記録を持つ feature の service に渡すだけにする
 * （記録の規則は各 feature が持ち、画面・MCP から記録したときと同じものになる）。
 * 投入用の資格に閲覧を許さないよう、作成・再送で得た記録の中身は返さない。
 * apiKeyName は受け付けたキーの名前で、記録がどこから入ったかとして残す。
 */
export async function ingest(input: RecordInput, apiKeyName: string): Promise<void> {
  switch (input.type) {
    case 'lemon': {
      const { careTypes, doneAt, note, id } = input;
      // キーを持つデバイス（ボタンなど）は誰が操作しても同じキーで送るので、記録した人は不明にし、
      // 代わりにキーの名前を残す
      await logCare({ careTypes, doneAt, note }, { apiKeyName }, id);
      return;
    }
    default: {
      // type を増やして振り分けを足し忘れたら型エラーにする（何も作らずに 201 を返さない）
      const unhandled: never = input.type;
      throw new Error(`unknown record type: ${unhandled}`);
    }
  }
}
