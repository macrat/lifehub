import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { meQueryOptions } from '../../../lib/auth.ts';
import { SubmitButton } from '../../../lib/ui/SubmitButton.tsx';
import { UserAvatar } from '../../users/components/UserAvatar.tsx';
import { useAddMemo } from '../queries.ts';
import { useMemoForm } from '../use-memo-form.ts';
import { MemoField } from './MemoField.tsx';

/**
 * PC のホームでタイムラインの上に常に出しておくメモの入力欄（X の投稿欄と同じ形）。
 * 左に自分の丸いアイコン、右に本文、その下に記録ボタン。記録したら空の欄に戻る
 * （入力の状態ごと作り直す。保存が受け付けられたら、書いたメモはタイムラインに先回りして出ている）。
 */
export function MemoComposer() {
  const [round, setRound] = useState(0);
  return <Composer key={round} onSaved={() => setRound((n) => n + 1)} />;
}

function Composer({ onSaved }: { onSaved: () => void }) {
  const { data: me } = useQuery(meQueryOptions);
  const addMemo = useAddMemo();
  const { body, setBody, errors, handleSubmit } = useMemoForm({
    onSubmit: addMemo.mutateAsync,
    onSaved,
  });
  return (
    <Stack
      component="form"
      onSubmit={handleSubmit}
      noValidate
      direction="row"
      spacing={2}
      sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
    >
      {me && <UserAvatar name={me.name} hue={me.hue} />}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <MemoField
          value={body}
          onChange={setBody}
          error={errors.body}
          placeholder="メモを記録"
          minRows={2}
        />
        <Stack direction="row" sx={{ justifyContent: 'flex-end', mt: 1 }}>
          <SubmitButton disabled={body.trim() === ''}>記録</SubmitButton>
        </Stack>
      </Box>
    </Stack>
  );
}
