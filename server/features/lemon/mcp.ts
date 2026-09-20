import { createCareLogSchema } from '../../../shared/validation/lemon.ts';
import { jsonResult, type ToolRegistrar } from '../../lib/mcp/types.ts';
import * as service from './service.ts';

export const registerLemonTools: ToolRegistrar = (server, ctx) => {
  server.registerTool(
    'lemon_get_status',
    {
      title: 'レモンの木の状態',
      description:
        'レモンの木の世話の状況を返す。種別（water=水やり, mist=葉水, fertilize=施肥, bloom=開花, harvest=収穫）ごとの最終実施日時と、そこからの経過日数（JST の暦日差）。未実施なら null。',
      inputSchema: {},
    },
    async () => jsonResult(await service.getStatus()),
  );

  server.registerTool(
    'lemon_log_care',
    {
      title: 'レモンの世話を記録',
      description:
        'レモンの木の世話を記録する。careType は water / mist / fertilize / bloom / harvest / note。doneAt は ISO 8601（省略時は現在時刻を指定すること）。note 種別は本文（note）が必須。',
      inputSchema: createCareLogSchema,
    },
    async (input) => jsonResult(await service.logCare(input, ctx.userId)),
  );
};
