import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginForm } from '../features/users/components/LoginForm.tsx';
import { authClient, meQueryOptions } from '../lib/auth.ts';
import { ensureData } from '../lib/query-client.ts';

// 署名付きの OAuth クエリ（未知のキー）をそのまま残すため loose にする
const searchSchema = z.looseObject({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  beforeLoad: async ({ context, search }) => {
    // ログイン済みならログイン画面を見せない
    const me = navigator.onLine
      ? await context.queryClient.fetchQuery({ ...meQueryOptions, staleTime: 0 })
      : await ensureData(context.queryClient, meQueryOptions);
    if (me) throw redirect({ to: search.redirect ?? '/' });
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
      <Paper sx={{ p: 3, width: '100%', maxWidth: 360 }} elevation={2}>
        <Typography variant="h5" component="h1" align="center" gutterBottom>
          LifeHub
        </Typography>
        <LoginForm
          onSubmit={async ({ email, password }) => {
            const { data, error } = await authClient.signIn.email({ email, password });
            if (error) {
              throw new Error(
                error.status === 401
                  ? 'メールアドレスまたはパスワードが違います'
                  : (error.message ?? 'ログインに失敗しました'),
              );
            }
            // MCP クライアントの認可フロー中（署名付きクエリ付きでここに来た場合）は、
            // better-auth が同意画面またはクライアントへの戻り先 URL を返すのでそこへ移動する
            if (
              data &&
              'redirect' in data &&
              data.redirect &&
              'url' in data &&
              typeof data.url === 'string'
            ) {
              window.location.assign(data.url);
              return;
            }
            // ルートガードはキャッシュを見るので、遷移前にログイン後のユーザーを取り直しておく
            await queryClient.fetchQuery({ ...meQueryOptions, staleTime: 0 });
            await navigate({ to: redirectTo ?? '/' });
          }}
        />
      </Paper>
    </Box>
  );
}
