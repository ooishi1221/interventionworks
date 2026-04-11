/**
 * 初回管理者アカウント作成スクリプト
 *
 * 使い方:
 *   node scripts/create-admin.mjs <email> <password>
 *
 * 例:
 *   node scripts/create-admin.mjs admin@interventionworks.com MySecurePassword123
 *
 * 前提条件:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY 環境変数にサービスアカウントキーの JSON が設定されている
 *   - または GOOGLE_APPLICATION_CREDENTIALS にサービスアカウントファイルのパスが設定されている
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('使い方: node scripts/create-admin.mjs <email> <password>');
  process.exit(1);
}

// Firebase Admin 初期化
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (serviceAccountKey) {
  const sa = JSON.parse(serviceAccountKey);
  initializeApp({ credential: cert(sa) });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf-8'));
  initializeApp({ credential: cert(sa) });
} else {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY または GOOGLE_APPLICATION_CREDENTIALS を設定してください');
  process.exit(1);
}

const auth = getAuth();

try {
  // ユーザー作成（既に存在する場合は取得）
  let user;
  try {
    user = await auth.getUserByEmail(email);
    console.log(`既存ユーザーを使用: ${user.uid}`);
  } catch {
    user = await auth.createUser({ email, password });
    console.log(`新規ユーザーを作成: ${user.uid}`);
  }

  // super_admin ロールを設定
  await auth.setCustomUserClaims(user.uid, { role: 'super_admin' });
  console.log(`super_admin ロールを付与しました: ${email}`);
  console.log('完了');
} catch (error) {
  console.error('エラー:', error);
  process.exit(1);
}
