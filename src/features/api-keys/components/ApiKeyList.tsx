import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { formatDateTime } from '../../../lib/date.ts';
import { IssuedSecretDialog } from '../../../lib/ui/IssuedSecretDialog.tsx';
import { ListItemSkeleton, QueryView } from '../../../lib/ui/QueryView.tsx';
import type { ApiKey } from '../queries.ts';
import { useApiKeyList } from '../use-api-key-list.ts';
import { ApiKeyForm } from './ApiKeyForm.tsx';

/**
 * 設定画面の「外部連携」の API キーの行。記録投入用エンドポイントを呼ぶデバイスやサービスに渡すキーを
 * 何本でも発行し、渡した先ごとに失効させる（[docs/features/api-keys.md](../../../../docs/features/api-keys.md)）。
 */
export function ApiKeyList() {
  const list = useApiKeyList();

  return (
    <>
      <ListItem>
        <ListItemText primary="API キー" secondary="記録投入用の API（POST /api/records）に使う" />
      </ListItem>
      <QueryView query={list.keysQuery} skeleton={<ListItemSkeleton />}>
        {(keys) =>
          keys.map((key) => <KeyItem key={key.id} apiKey={key} onRevoke={() => list.revoke(key)} />)
        }
      </QueryView>
      <ListItem>
        <Button startIcon={<AddIcon />} onClick={list.startCreate}>
          API キーを発行
        </Button>
      </ListItem>
      {list.createForm && <ApiKeyForm {...list.createForm} />}
      {list.issued && (
        <IssuedSecretDialog
          label="発行した API キー"
          copy="API キーをコピー"
          copied="API キーをコピーしました"
          name={list.issued.name}
          secret={list.issued.key}
          onClose={list.closeIssued}
        />
      )}
    </>
  );
}

/** 1 本の API キー。失効をその場で行う（確かめてから送る。キーそのものは保存していないので出せない） */
function KeyItem({ apiKey, onRevoke }: { apiKey: ApiKey; onRevoke: () => void }) {
  return (
    <ListItem
      secondaryAction={
        <IconButton edge="end" aria-label={`${apiKey.name} を失効`} onClick={onRevoke}>
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
