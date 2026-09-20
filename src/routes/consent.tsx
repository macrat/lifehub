import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { authClient, meQueryOptions } from '../lib/auth.ts';
import { ensureData } from '../lib/query-client.ts';

// 署名付きの OAuth クエリ（未知のキー）をそのまま残すため loose にする
const searchSchema = z.looseObject({
  client_id: z.string().optional(),
  scope: z.string().optional(),
});

/**
 * OAuth 2.1 の同意画面（MCP クライアントの認可）。
 * better-auth が署名付きのクエリでここへ送ってくる。同意の API 呼び出しには oauthProviderClient が
 * window.location.search（署名付きクエリ）を oauth_query として自動で添える。
 */
export const Route = createFileRoute('/consent')({
  validateSearch: searchSchema,
  beforeLoad: async ({ context, location }) => {
    const me = await ensureData(context.queryClient, meQueryOptions);
    if (!me) throw redirect({ to: '/login', search: { redirect: location.href } });
  },
  component: ConsentPage,
});

const SCOPE_LABELS: Record<string, string> = {
  openid: 'ログイン情報',
  profile: '名前',
  email: 'メールアドレス',
  offline_access: '継続的なアクセス（更新トークン）',
};

function ConsentPage() {
  const { client_id: clientId, scope } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const scopes = (scope ?? '').split(' ').filter(Boolean);

  const respond = async (accept: boolean) => {
    setSubmitting(true);
    setError(null);
    const result = await authClient.oauth2.consent({ accept });
    if (result.error) {
      setError(result.error.message ?? '処理に失敗しました');
      setSubmitting(false);
      return;
    }
    window.location.assign(result.data.url);
  };

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        bgcolor: 'background.default',
      }}
    >
      <Paper sx={{ p: 3, width: '100%', maxWidth: 420 }} elevation={2}>
        <Stack spacing={2}>
          <Typography variant="h5" component="h1">
            アクセスの許可
          </Typography>
          <Typography>
            <strong>{clientId ?? 'アプリ'}</strong> が LifeHub
            のデータ（予定・タスク・立替・レモンの記録）を あなたとして読み書きしようとしています。
          </Typography>
          {scopes.length > 0 && (
            <List dense disablePadding>
              {scopes.map((s) => (
                <ListItem key={s} disablePadding>
                  <ListItemText primary={SCOPE_LABELS[s] ?? s} />
                </ListItem>
              ))}
            </List>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button disabled={submitting} onClick={() => respond(false)}>
              拒否
            </Button>
            <Button variant="contained" disabled={submitting} onClick={() => respond(true)}>
              許可
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
