# INAS email console

This Apps Script sends the active Firebase roster personalized invitations in safe, resumable batches. It does not send anything during setup.

## One-time setup

1. Create a private Google Sheet using the account that will send the invitations.
2. Open **Extensions → Apps Script** and add the four `.gs` files from this folder plus `appsscript.json`.
3. In Apps Script **Project Settings**, connect your Google Cloud / Firebase project number.
4. If the sender is a different account, add it to the Firebase project with permission to read and update Firestore.
5. Upload the supplied INAS logo to Google Drive and copy its file ID.
6. Reload the Sheet and choose **INAS → 1 · Setup email console**.
7. Paste the logo file ID and your own test email into the `Settings` sheet.

## Safe send order

1. **Preview invitation** — opens the exact email; sends nothing.
2. **Send one test** — sends only to `test_email`; participant states do not change.
3. **Campaign status** — confirms the pending count and daily quota.
4. **Approve and start** — requires typing the exact pending count.

The script handles at most 25 invitations per execution and checks the remaining MailApp quota. A five-minute trigger resumes pending work. A send successfully handed to Google is marked `sent`; this does not prove inbox delivery. An ambiguous send becomes `unknown` and is never retried automatically.

The QR contains only `INAS1.inas-quality-2026.<private-token>` and no attendee name or email. Every QR image was generated locally and is stored in Firebase's private ticket area; no external QR service receives the token. Two private replacement tickets are prepared for each participant.
