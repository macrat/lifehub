import type { RecordInput } from '../../../shared/validation/records.ts';
import { logCare } from '../lemon/service.ts';

/**
 * 記録投入用エンドポイントの受け付け。`type` で振り分けて、その記録を持つ feature の service に渡すだけにする
 * （記録の規則は各 feature が持ち、画面・MCP から記録したときと同じものになる）。
 * 返すのは作った記録そのもの（各 feature の API が作成に返すものと同じ形）。
 */
export async function ingest(input: RecordInput, userId: string) {
  switch (input.type) {
    case 'lemon': {
      const { careTypes, doneAt, note, id } = input;
      return logCare({ careTypes, doneAt, note }, userId, id);
    }
  }
}
