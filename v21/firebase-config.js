/* ============================================================
   Firebase configuration for the SHARED board (v2)
   ------------------------------------------------------------
   1. Create a free Firebase project: https://console.firebase.google.com
   2. Build → Firestore Database → Create database (Production mode).
   3. Project settings (gear) → "Your apps" → Web app (</>) → register →
      copy the `firebaseConfig` values into the object below.
   4. Firestore → Rules → paste the rules from the README, then Publish.

   Leaving the placeholder values (starting with "YOUR_") keeps the app in
   LOCAL-ONLY mode: it works, but changes stay on this device with no sync.

   NOTE: These values are meant to be public — they ship in every web app.
   Your data is protected by Firestore *rules* + the secret board ID, not by
   hiding this config.
   ============================================================ */

export const firebaseConfig = {
  apiKey: "AIzaSyBhU3i9VC_g-x88RUeUoPtbL1hqnl_H6gU",
  authDomain: "kalayaan-bishopric-dashboard.firebaseapp.com",
  projectId: "kalayaan-bishopric-dashboard",
  storageBucket: "kalayaan-bishopric-dashboard.firebasestorage.app",
  messagingSenderId: "578499475456",
  appId: "1:578499475456:web:84bc6e9a2bcc0e60d300e5",
};

/* Optional: pin ONE shared board for everyone who opens the app, ignoring the
   URL's #b=... id. Leave empty ("") to use per-link secret board IDs instead.
   Set to a fixed name so the whole bishopric lands on the same board. */
export const FIXED_BOARD_ID = "kalayaan";
