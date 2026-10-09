import type { ApiKeyInput } from '../../../shared/validation/api-keys.ts';
import { useStoreQuery } from '../../lib/screen-data.ts';
import { useToggle } from '../../lib/ui/use-toggle.ts';
import { type ApiKey, apiKeysQueryOptions, useCreateApiKey, useRevokeApiKey } from './queries.ts';

/**
 * 設定画面の API キーの一覧（`ApiKeyList`）の状態と操作。発行のフォームを開いているか、発行したキー、
 * 失効（確かめてから送る）を持つ。フォームに渡すもの（`createForm`）は、閉じていれば null。
 */
export function useApiKeyList() {
  const keysQuery = useStoreQuery(apiKeysQueryOptions);
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const creating = useToggle();

  return {
    keysQuery,
    startCreate: creating.on,
    revoke: (key: ApiKey) => {
      if (!window.confirm(`「${key.name}」を失効しますか？このキーでは記録できなくなります。`))
        return;
      revokeKey.mutate(key.id);
    },
    createForm: creating.value
      ? {
          onClose: creating.off,
          onSubmit: (input: ApiKeyInput) => createKey.issue(input),
        }
      : null,
    issued: createKey.issued,
    closeIssued: createKey.closeIssued,
  };
}
