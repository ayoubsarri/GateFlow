import { randomBytes, scryptSync } from "node:crypto";

const pin = process.argv[2];
if (!pin || pin.length < 4) {
  console.error("Usage: npm run hash-pin -- <PIN>");
  process.exit(1);
}
const salt = randomBytes(24).toString("hex");
const hash = scryptSync(pin, salt, 64).toString("hex");
console.log(`EVENT_PIN_SALT=${salt}`);
console.log(`EVENT_PIN_HASH=${hash}`);
