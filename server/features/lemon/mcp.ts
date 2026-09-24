import { instantSchema } from '../../../shared/validation/common.ts';
import { careLogFieldsSchema, withCareLogRules } from '../../../shared/validation/lemon.ts';
import { jsonResult, type ToolRegistrar } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

/**
 * 世話の記録の入力。doneAt は省略でき、省くと今になる。
 * WHY: LLM は今の日時を正確には知らないので、必須にすると推し量った日時が記録される。
 * 「今やった」の記録がほとんどなので、日時を言われたときだけ渡させる。
 */
const logCareInputSchema = withCareLogRules(
  careLogFieldsSchema.extend({ doneAt: instantSchema.optional() }),
);

export const registerLemonTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    'lemon_get_status',
    {
      title: 'レモンの木の状態',
      description:
        'レモンの木の世話の状況を返す。項目（mist=葉水, water=水やり, fertilize=施肥, bloom=開花, drop=落果, harvest=収穫）ごとの最終実施日時と、そこからの経過日数（JST の暦日差）。未実施なら null。',
      inputSchema: {},
    },
    async () => jsonResult(await service.getStatus()),
  );

  server.registerTool(
    'lemon_log_care',
    {
      title: 'レモンの世話を記録',
      description:
        'レモンの木の世話を 1 件記録する。careTypes はその 1 回でやったことの配列で、mist / water / fertilize / bloom / drop / harvest から必要なだけ挙げる（葉水と水やりを一緒にやったなら ["mist", "water"]）。doneAt は ISO 8601 で、今やったことなら省略する（省略すると今）。careTypes が空なら本文（note）が必須で、その記録はメモになる。',
      inputSchema: logCareInputSchema,
    },
    async ({ doneAt, ...input }) =>
      jsonResult(await service.logCare({ ...input, doneAt: doneAt ?? new Date() }, ctx.userId)),
  );
};
