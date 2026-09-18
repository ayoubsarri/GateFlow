import { defineSecret } from "firebase-functions/params";

export const REGION = "europe-west1";
export const FIRESTORE_DATABASE_ID = "inas-eu";
export const SESSION_HOURS = 12;
export const PIN_SALT = defineSecret("EVENT_PIN_SALT");
export const PIN_HASH = defineSecret("EVENT_PIN_HASH");
export const APPS_SCRIPT_HMAC_SECRET = defineSecret("APPS_SCRIPT_HMAC_SECRET");
