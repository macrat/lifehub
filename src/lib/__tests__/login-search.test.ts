import { describe, expect, it } from 'vitest';
import { loginSearchSchema } from '../login-search.ts';

describe('ログインの戻り先', () => {
  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/\nevil.example',
    'https://lifehub.invalid@evil.example',
  ])('外部への戻り先を拒否: %s', (redirect) => {
    expect(loginSearchSchema.parse({ redirect }).redirect).toBe('/');
  });
  it('アプリのパスと署名付き OAuth クエリを保持する', () => {
    const input = { redirect: '/calendar?date=2026-09-21', oauth_query: 'signed-query' };
    expect(loginSearchSchema.parse(input)).toEqual(input);
  });
});
