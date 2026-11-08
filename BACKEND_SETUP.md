# Sucharu Backend Setup

The Node.js/Express API now stores operational data in Firebase Cloud Firestore: admins, customers, partners, services, and bookings. The API uses the Firebase Admin SDK with a private service-account key. MongoDB is no longer required by the running backend. Existing records in the old MongoDB database have not been copied; retain that source until you decide whether the old demo records are needed.

## Local environment

Keep the service-account JSON private and outside the project, for example at `C:\Users\ASUS\AppData\Local\SucharuSecrets\firebase-admin.json`. Do not paste or commit it. In `backend/.env`, configure:

```env
PORT=5000
FIREBASE_PROJECT_ID=sucharu-87667
GOOGLE_APPLICATION_CREDENTIALS=C:\Users\ASUS\AppData\Local\SucharuSecrets\firebase-admin.json
JWT_SECRET=<your-existing-random-secret>
ADMIN_EMAIL=<your-admin-email>
ADMIN_PASSWORD=<your-strong-admin-password>
CLIENT_URL=http://127.0.0.1:5500,http://localhost:5500
CUSTOMER_AUTH_MODE=legacy
SMTP_HOST=<your-email-provider-smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<verified-sender-email>
SMTP_PASS=<provider-app-password-or-smtp-credential>
SMTP_FROM=Sucharu <verified-sender-email>
```

Use the real local values already configured in your private `.env`; never share these credentials in chat. `CUSTOMER_AUTH_MODE=legacy` keeps the existing web/API customer session format while customer and business records are stored in Firestore. The backend can issue a Firebase custom token when set to `firebase`, but the web and Android clients must sign in with that token before enabling that mode.

Customer registration requires a valid email address, and that email must be unique. Forgot Password sends a six-digit code through SMTP; codes expire after 10 minutes, allow five attempts, and can be requested at most once per minute (five times per hour per email). Configure a verified sender and SMTP app credential in the private `backend/.env` before this feature can send mail. For Gmail, use a Google app password with 2-Step Verification; never put the normal account password in `.env` or share SMTP credentials in chat. Restart the API after changing SMTP settings. Existing accounts without an email need their profile email added before they can use recovery.

In Firebase Console, verify Firestore is enabled in project `sucharu-87667`. Admin SDK access uses the service account and bypasses client Firestore rules; keep the key private and use restrictive client rules for direct client access.

The repository includes `firestore.rules` and `firebase.json`. The current rule set denies all direct Firestore access from Android, web, and other client SDKs because clients should use the Express API. The API's Firebase Admin SDK is server-side and bypasses these rules. Before releasing the rules, select the intended Firebase project with the Firebase CLI and review the project shown by `firebase use`; then deploy only the rules with `firebase deploy --only firestore:rules`. Do not deploy to production until the selected project is confirmed.

## Run locally

From PowerShell or the VS Code terminal:

```powershell
cd Sucharu_Operational\backend
npm run seed
npm run dev
```

The seed adds the configured admin and seven editable starter services only when their Firestore records do not already exist. Then open `http://localhost:5000/api/health`; a successful response includes `"status":"ok"`, `"database":"connected"`, and `"provider":"firebase"`.

Serve the customer website and admin page with VS Code Live Server. Ensure the Live Server origin is listed in `CLIENT_URL`.

## Shared website and Android API

The website and native Android app use the same Express API and the same Firestore project. Run one backend instance with `npm run dev`; the website can continue using `http://localhost:5000/api` from the computer running Live Server. Android's API base URL is supplied by the Gradle property `sucharuApiBaseUrl` and defaults to `http://10.0.2.2:5000/api`, which reaches the development computer from the standard Android emulator.

For a physical Android phone, connect the phone and development computer to the same trusted Wi-Fi, then set `sucharuApiBaseUrl` to `http://<computer-LAN-IPv4>:5000/api` in Android Studio's Gradle properties or pass `-PsucharuApiBaseUrl=http://<computer-LAN-IPv4>:5000/api` to the Gradle build. Allow the Node process through the computer firewall on the private network if Android Studio or Windows asks. The Android debug manifest already permits cleartext HTTP for local development. For a release build, use a deployed HTTPS API URL with the same property; do not ship a local IP or HTTP endpoint.

## Main API features

- Customer account registration/login and booking history.
- Customer service requests and public booking tracking.
- Admin login, dashboard, service catalog editing, partner management, booking status and partner assignment.
- Partner portal login, assigned jobs, and service status updates.

COD, bKash and Nagad are stored as manual payment preferences. No gateway or automatic payment verification is integrated. Starter service prices are estimates and remain editable.

## Existing MongoDB data

The application code no longer connects to MongoDB. The old Atlas data has not been migrated into Firestore because Atlas was unreachable during the cutover. New Firestore records are independent. If old customer, partner or booking data must be preserved, export it from MongoDB when available and run a reviewed one-time import before deleting or closing the old database. Do not put Atlas credentials into the new `.env`.
