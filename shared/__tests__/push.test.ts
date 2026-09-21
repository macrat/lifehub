import { describe, expect, it } from 'vitest';
import { pushEndpointSchema, pushSubscriptionSchema } from '../validation/push.ts';

describe('Push の送信先', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/token',
    'https://updates.push.services.mozilla.com/wpush/v2/token',
    'https://web.push.apple.com/token',
    'https://wns2-db5p.notify.windows.com/w/?token=x',
  ])('ブラウザの Push サービスを許可: %s', (endpoint) => {
    expect(pushEndpointSchema.safeParse(endpoint).success).toBe(true);
  });
  it.each([
    'https://127.0.0.1/private',
    'https://[::1]/',
    'https://169.254.169.254/',
    'https://localhost/',
    'https://attacker.example/',
    'http://fcm.googleapis.com/token',
    'https://fcm.googleapis.com:8443/token',
    'https://fcm.googleapis.com.attacker.example/',
    'https://evilpush.apple.com/',
    'https://push.apple.com.attacker.example/',
    'https://user:pass@fcm.googleapis.com/token',
    'https://fcm.googleapis.com/token#fragment',
    'https://fcm.googleapis.com@attacker.example/',
  ])('任意の宛先・紛らわしい URL を拒否: %s', (endpoint) => {
    expect(pushEndpointSchema.safeParse(endpoint).success).toBe(false);
  });
  it('不正な鍵を保存しない', () => {
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: 'https://fcm.googleapis.com/token',
        keys: { p256dh: 'x', auth: 'x' },
      }).success,
    ).toBe(false);
  });
});
