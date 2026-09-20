import webpush from 'web-push';

/**
 * Web Push の VAPID 鍵ペアを生成する。一度だけ実行し、GitHub Secrets（TF_VAR_vapid_public_key / TF_VAR_vapid_private_key）に登録する。
 */
const keys = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
