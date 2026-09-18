import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { FIRESTORE_DATABASE_ID } from "./config.js";

const app = getApps()[0] || initializeApp();

export const db = getFirestore(app, FIRESTORE_DATABASE_ID);
export const adminAuth = getAuth(app);
