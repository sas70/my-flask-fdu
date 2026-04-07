import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function ensureApp() {
  if (getApps().length > 0) return getApps()[0];

  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON;
  if (!raw) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVICE_ACCOUNT_KEY_JSON"
    );
  }
  const serviceAccount = JSON.parse(raw);
  const app = initializeApp({ credential: cert(serviceAccount) });
  console.info(
    "[firebase-admin] Initialized for project:",
    serviceAccount.project_id
  );
  return app;
}

export function getDb() {
  return getFirestore(ensureApp());
}
