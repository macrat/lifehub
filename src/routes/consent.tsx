import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { consentHostsOf, requireSignedIn, useConsent } from '../lib/auth.ts';
import { CenteredPage } from '../lib/ui/CenteredPage.tsx';

// 署名付きの OAuth クエリ（未知のキー）をそのまま残すため loose にする
const searchSchema = z.looseObject({
  client_id: z.string().optional(),
  redirect_uri: z.string().optional(),
  scope: z.string().optional(),
});

/**
 * OAuth 2.1 の同意画面（MCP クライアントの認可）。
 * better-auth が署名付きのクエリでここへ送ってくる。返事は `useConsent`。
 * 見分けに使うホストと警告を出す理由は docs/features/mcp.md。
 */
export const Route = createFileRoute('/consent')({
  validateSearch: searchSchema,
  beforeLoad: ({ context, location }) => requireSignedIn(context.queryClient, location.href),
  component: ConsentPage,
});

const SCOPE_LABELS: Record<string, string> = {
  openid: 'ログイン情報',
  profile: '名前',
  email: 'メールアドレス',
  offline_access: '継続的なアクセス（更新トークン。毎回の許可なしに使い続けられる）',
};

/** 見分けに使うホスト（`consentHostsOf`）と、その見出し */
const HOST_LABELS = [
  ['clientHost', 'アプリの配布元'],
  ['redirectHost', '許可した後の戻り先'],
] as const;

function ConsentPage() {
  const { client_id: clientId, redirect_uri: redirectUri, scope } = Route.useSearch();
  const consent = useConsent();
  // 受け付けられたら画面を離れるので、移り終わるまで押せないままにする
  const submitting = consent.isPending || consent.isSuccess;
  const scopes = (scope ?? '').split(' ').filter(Boolean);
  const hosts = consentHostsOf(clientId, redirectUri);

  return (
    <CenteredPage maxWidth={420}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h1">
          アクセスの許可
        </Typography>
        <Alert severity="warning">
          {
            '自分でアプリに LifeHub をつないでいる途中のときだけ許可してください。届いたリンクから開いたときや、心当たりの無いときは拒否してください。'
          }
        </Alert>
        <List dense disablePadding>
          {HOST_LABELS.map(
            ([key, label]) =>
              hosts[key] && (
                <ListItem key={key} disablePadding>
                  <ListItemText
                    secondary={label}
                    primary={hosts[key]}
                    slotProps={{ primary: { variant: 'h6', sx: { overflowWrap: 'anywhere' } } }}
                  />
                </ListItem>
              ),
          )}
        </List>
        <Typography>
          許可すると、このアプリは LifeHub
          のすべての記録（予定・タスク・お金の記録と口座の入出金・レモンの世話・メモ）を、あなたとして読み書きできるようになります。
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
        {consent.error && <Alert severity="error">{consent.error.message}</Alert>}
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button disabled={submitting} onClick={() => consent.mutate(false)}>
            拒否
          </Button>
          <Button variant="contained" disabled={submitting} onClick={() => consent.mutate(true)}>
            許可
          </Button>
        </Stack>
      </Stack>
    </CenteredPage>
  );
}
