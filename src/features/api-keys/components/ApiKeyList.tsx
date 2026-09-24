import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import { useQuery } from '@tanstack/react-query';
import { formatDateTime } from '../../../lib/date.ts';
import { QueryView } from '../../../lib/ui/QueryView.tsx';
import { useOpenWith, useToggle } from '../../../lib/ui/use-toggle.ts';
import {
  type ApiKey,
  apiKeysQueryOptions,
  type IssuedApiKey,
  useCreateApiKey,
  useRevokeApiKey,
} from '../queries.ts';
import { ApiKeyForm } from './ApiKeyForm.tsx';
import { IssuedApiKeyDialog } from './IssuedApiKeyDialog.tsx';

/**
 * 設定画面の「外部連携」の API キーの行。記録投入用エンドポイントを呼ぶデバイスやサービスに渡すキーを
 * 何本でも発行し、渡した先ごとに失効させる（[docs/features/api-keys.md](../../../../docs/features/api-keys.md)）。
 */
export function ApiKeyList() {
  const keysQuery = useQuery(apiKeysQueryOptions);
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const creating = useToggle();
  // 発行したキーは閉じるまでここだけが持つ（サーバーにもキャッシュにも残らない）
  const issued = useOpenWith<IssuedApiKey>();

  return (
    <>
      <ListItem>
        <ListItemText primary="API キー" secondary="記録投入用の API（POST /api/records）に使う" />
      </ListItem>
      <QueryView query={keysQuery} skeleton={<KeySkeleton />}>
        {(keys) =>
          keys.map((key) => (
            <KeyItem key={key.id} apiKey={key} onRevoke={() => revokeKey.mutate(key.id)} />
          ))
        }
      </QueryView>
      <ListItem>
        <Button startIcon={<AddIcon />} onClick={creating.on}>
          API キーを発行
        </Button>
      </ListItem>
      {creating.value && (
        <ApiKeyForm
          onClose={creating.off}
          onSubmit={async (input) => issued.open(await createKey.mutateAsync(input))}
        />
      )}
      {issued.value && <IssuedApiKeyDialog apiKey={issued.value} onClose={issued.close} />}
    </>
  );
}

/** 1 本の API キー。失効をその場で行う（キーそのものは保存していないので出せない） */
function KeyItem({ apiKey, onRevoke }: { apiKey: ApiKey; onRevoke: () => void }) {
  return (
    <ListItem
      secondaryAction={
        <IconButton
          edge="end"
          aria-label={`${apiKey.name} を失効`}
          onClick={() => {
            if (
              window.confirm(`「${apiKey.name}」を失効しますか？このキーでは記録できなくなります。`)
            )
              onRevoke();
          }}
        >
          <DeleteIcon />
        </IconButton>
      }
    >
      <ListItemText
        primary={apiKey.name}
        secondary={
          apiKey.lastUsedAt
            ? `最後に使われたのは ${formatDateTime(apiKey.lastUsedAt)}`
            : 'まだ一度も使われていません'
        }
      />
    </ListItem>
  );
}

function KeySkeleton() {
  return (
    <ListItem>
      <ListItemText primary={<Skeleton width="40%" />} secondary={<Skeleton width="60%" />} />
    </ListItem>
  );
}
