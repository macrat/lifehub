/** E2E のユーザー。ワーカーごとの DB（`servers.ts`）に同じ 2 人を作る（`prepare-db.ts`） */
export const E2E_USER = {
  email: 'e2e@example.com',
  name: 'E2E',
  password: 'e2e-password-123',
};

/** 相手のユーザー（家族のもう 1 人。参加者や立替の相手に使う） */
export const PARTNER_USER = {
  email: 'partner@example.com',
  name: '相手',
  password: 'partner-password-1',
};
