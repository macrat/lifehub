import { ProtocolError } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { McpRegistrar } from '../../lib/mcp/types.ts';
import { EVENT_NAMES, type EventName, subscribe, unsubscribe } from './service.ts';

/**
 * MCP Events（`io.modelcontextprotocol/events`。ドラフトの拡張）の webhook 配信。
 * 記録の種類ごとに、追加・編集・削除されたら購読者の URL へ知らせる。読むのは `read_timeline`、書くのは各ツール。
 * 配る範囲は家族で読めるものと同じで、誰が書いた記録も届く（タイムラインはどちらの記録も読めるため）。
 * 予定・タスクの通知（`event.reminder`）は、プッシュ通知と同じ時に、同じ宛先の購読へ知らせる。
 * 届かない配り方（poll・push、gap / terminated の知らせ、cursor での遡り）は持たない。
 * WHY webhook だけ: サーバーレスで接続を持ち続けられず（push）、遡れる履歴も持たない（poll と cursor）。
 */

/** エラーのコード（MCP Events） */
const NOT_FOUND = -32011;
const UNSUPPORTED = -32014;
const CALLBACK_ENDPOINT_ERROR = -32015;

/** 届くエントリー。read_timeline や書くツールが返すものと同じ形 */
const entrySchema = z.looseObject({ ref: z.string(), type: z.string() });

const CHANGED_PAYLOAD_SCHEMA = z.toJSONSchema(
  z.object({
    action: z
      .enum(['added', 'updated', 'deleted'])
      .describe('added は追加、updated は編集、deleted は削除'),
    by: z
      .string()
      .describe('追加・編集・削除した人の名前（API キーで入れた記録は「API キー「<名前>」」）'),
    entry: entrySchema.describe(
      'エントリー。追加・編集は書いた後、削除は消す前のもの。read_timeline が返すエントリーと同じ形で、追加・編集なら ref を update_* / delete_entry に渡せる',
    ),
    scope: z
      .enum(['this', 'following'])
      .optional()
      .describe(
        '繰り返しの予定・タスクの回を消したときだけ付く。this はその回だけ、following はその回以降すべてを消した',
      ),
  }),
);

const REMINDER_PAYLOAD_SCHEMA = z.toJSONSchema(
  z.object({
    about: z
      .enum(['start', 'end', 'due'])
      .describe('何の通知か。start は開始、end は予定の終了、due はタスクの期限'),
    entry: entrySchema.describe(
      '通知した予定・タスク（繰り返しならその回）。read_timeline が返すエントリーと同じ形で、ref を update_event / set_task_done に渡せる',
    ),
  }),
);

const EVENTS: Record<EventName, { description: string; payloadSchema: object }> = {
  'memo.changed': {
    description: 'メモが書かれた・直された・消されたとき',
    payloadSchema: CHANGED_PAYLOAD_SCHEMA,
  },
  'event.changed': {
    description:
      '予定かタスクが足された・変えられた・消されたとき（タスクの完了・完了の取り消しも含む。繰り返しの 1 回だけを変えた・消したときは、その回）',
    payloadSchema: CHANGED_PAYLOAD_SCHEMA,
  },
  'expense.changed': {
    description: '立替（精算を含む）が記録された・直された・消されたとき',
    payloadSchema: CHANGED_PAYLOAD_SCHEMA,
  },
  'lemon.changed': {
    description: 'レモンの木の世話が記録された・直された・消されたとき',
    payloadSchema: CHANGED_PAYLOAD_SCHEMA,
  },
  'event.reminder': {
    description:
      '予定・タスクの通知の時刻になったとき（アプリのプッシュ通知と同じ時。通知を設定した予定・タスクの開始・終了・期限の前で、届くのは参加している予定・タスクの分だけ）',
    payloadSchema: REMINDER_PAYLOAD_SCHEMA,
  },
};

/** 購読の引数は無い（そのイベントのすべてが届く。通知は宛先の人の購読にだけ届く） */
const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/**
 * 引数の規則はスキーマに書き、外れれば SDK が Invalid Params（-32602）で返す。
 * 購読の引数は無い。通知先は https。署名の鍵は `whsec_` に続く base64 で、24〜64 バイト（MCP Events）。
 */
const argumentsSchema = z.strictObject({}).optional();
const secretSchema = z
  .string()
  .regex(/^whsec_[A-Za-z0-9+/]+={0,2}$/)
  .refine((secret) => {
    const size = Buffer.from(secret.slice('whsec_'.length), 'base64').length;
    return size >= 24 && size <= 64;
  }, 'delivery.secret must be whsec_ + base64 of 24-64 bytes');

const listParams = z.looseObject({ cursor: z.string().optional() });
const subscribeParams = z.looseObject({
  name: z.string(),
  arguments: argumentsSchema,
  delivery: z.looseObject({
    mode: z.string(),
    url: z.url({ protocol: /^https$/ }),
    secret: secretSchema,
  }),
  cursor: z.string().nullable().optional(),
  ttlMs: z.number().int().positive().nullable().optional(),
});
const unsubscribeParams = z.looseObject({
  name: z.string(),
  arguments: argumentsSchema,
  delivery: z.looseObject({ url: z.string() }),
});

const NAMES = Object.values(EVENT_NAMES);

function eventNameOf(name: string): EventName {
  const found = NAMES.find((n) => n === name);
  if (!found) throw new ProtocolError(NOT_FOUND, `unknown event: ${name}`);
  return found;
}

export const registerEventSubscriptions: McpRegistrar = (mcp, ctx) => {
  const { server } = mcp;
  // 仕様のドラフトと ChatGPT は capabilities.events を読み、拡張としての名前は extensions に出す。
  // SDK の型は events を知らないので広げて渡す（SDK は capabilities をそのまま返すので、events も届く）
  server.registerCapabilities({
    extensions: { 'io.modelcontextprotocol/events': {} },
    ...({ events: {} } as object),
  });

  server.setRequestHandler('events/list', { params: listParams }, () => ({
    events: NAMES.map((name) => ({
      name,
      ...EVENTS[name],
      delivery: ['webhook'],
      inputSchema: INPUT_SCHEMA,
    })),
  }));

  server.setRequestHandler('events/subscribe', { params: subscribeParams }, async (params) => {
    const name = eventNameOf(params.name);
    const { delivery } = params;
    if (delivery.mode !== 'webhook') {
      throw new ProtocolError(UNSUPPORTED, 'only webhook delivery is supported', {
        feature: 'delivery.mode',
        value: delivery.mode,
      });
    }
    const result = await subscribe(ctx.userId, {
      name,
      url: delivery.url,
      secret: delivery.secret,
      ttlMs: params.ttlMs,
    });
    if (!result.ok) {
      throw new ProtocolError(CALLBACK_ENDPOINT_ERROR, 'callback endpoint verification failed', {
        reason: result.reason,
      });
    }
    return {
      id: result.id,
      refreshBefore: result.refreshBefore.toISOString(),
      // 遡れる履歴を持たないので、cursor は常に null。遡りを求められたら、遡れなかったことを伝える
      cursor: null,
      truncated: params.cursor != null,
    };
  });

  server.setRequestHandler('events/unsubscribe', { params: unsubscribeParams }, async (params) => {
    const name = eventNameOf(params.name);
    await unsubscribe(ctx.userId, { name, url: params.delivery.url });
    return {};
  });
};
