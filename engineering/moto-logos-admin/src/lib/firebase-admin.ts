import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKey) {
    const serviceAccount = JSON.parse(serviceAccountKey);
    return initializeApp({
      credential: cert(serviceAccount),
    });
  }

  // Google Cloud 環境ではデフォルト認証情報を使用
  return initializeApp();
}

const app = getAdminApp();

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);
