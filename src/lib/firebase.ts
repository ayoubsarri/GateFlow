import { connectAuthEmulator, getAuth } from "firebase/auth";
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
if (app && import.meta.env.VITE_FIREBASE_APPCHECK_KEY && import.meta.env.VITE_USE_EMULATORS !== "true") {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_FIREBASE_APPCHECK_KEY),
    isTokenAutoRefreshEnabled: true
  });
}
export const auth = app ? getAuth(app) : null;
const databaseId = import.meta.env.VITE_FIRESTORE_DATABASE_ID;
export const db = app ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }, databaseId && databaseId !== "(default)" ? databaseId : undefined) : null;

let emulatorsConnected = false;
if (app && import.meta.env.VITE_USE_EMULATORS === "true" && !emulatorsConnected) {
  connectAuthEmulator(auth!, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db!, "127.0.0.1", 8080);
  emulatorsConnected = true;
}
