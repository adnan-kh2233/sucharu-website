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
BREVO_API_KEY=<brevo-api-key>
BREVO_SENDER_EMAIL=<verified-sender-email>
BREVO_SENDER_NAME=Sucharu
```

Use the real local values already configured in your private `.env`; never share these credentials in chat. `CUSTOMER_AUTH_MODE=legacy` keeps the existing web/API customer session format while customer and business records are stored in Firestore. The backend can issue a Firebase custom token when set to `firebase`, but the web and Android clients must sign in with that token before enabling that mode.

Customer registration requires a valid email address, and that email must be unique. Forgot Password sends a six-digit code; codes expire after 10 minutes, allow five attempts, and can be requested at most once per minute (five times per hour per email). Render Free blocks SMTP ports, so the deployed service sends through Brevo's HTTPS transactional email API when `BREVO_API_KEY` and a verified `BREVO_SENDER_EMAIL` are set. SMTP remains available for local development. Keep provider credentials private and never paste them in chat. Existing accounts without an email need their profile email added before they can use recovery.

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

## No-cost internet demo deployment

For a cable-free school demo without Google Cloud prepayment, this repository includes a Render Blueprint in `render.yaml`. It runs only the existing Express API on Render's **Free** web-service plan in Singapore; Firestore remains the database in Firebase. Keep the Firebase project on the Spark plan and do not upgrade it to Blaze or attach paid services for this deployment. Spark provides capped no-cost quotas; if a product exceeds its quota, that product is disabled until the next cycle instead of switching to pay-as-you-go.

In the Render Dashboard, create a Blueprint from this GitHub repository and select `render.yaml`. Choose the Free plan. Do not add a payment method. After Render creates the service, open **Environment** and upload the private `backend/secrets/firebase-admin.json` as a secret file named `firebase-admin.json`. The Blueprint sets `GOOGLE_APPLICATION_CREDENTIALS` to Render's `/etc/secrets/firebase-admin.json` path. Enter the local `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` values individually in Render's Environment settings; do not put them in this repository or paste them into chat. Do not upload the whole `.env` file.

The free service sleeps after 15 minutes without requests and may take about one minute to wake up. Free-plan limits can suspend the service instead of billing when no payment method is attached. This is suitable for a low-traffic demo, not an always-on production service. For password reset on Render Free, create a Brevo account, activate transactional email, verify a sender email, then set `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` in the Render Environment page. Brevo documents its free plan as $0 with 300 email sends per day; sending still depends on completing its account and sender verification. Do not add SMTP credentials to Render Free because outbound SMTP ports are blocked.

After the first successful deploy, use its HTTPS service URL as the Android API base URL. From the Android project folder, build an installable debug APK with:

```powershell
./gradlew.bat assembleDebug "-PsucharuApiBaseUrl=https://<your-render-service>.onrender.com/api"
```

The app can then be installed on the phone and used over Wi-Fi or mobile data without the USB cable. Verify the deployed API first at `https://<your-render-service>.onrender.com/api/health`; it should report a connected Firebase database.

## Main API features

- Customer account registration/login and booking history.
- Customer service requests and public booking tracking.
- Admin login, dashboard, service catalog editing, partner management, booking status and partner assignment.
- Partner portal login, assigned jobs, and service status updates.

COD, bKash and Nagad are stored as manual payment preferences. No gateway or automatic payment verification is integrated. Starter service prices are estimates and remain editable.

## Existing MongoDB data

The application code no longer connects to MongoDB. The old Atlas data has not been migrated into Firestore because Atlas was unreachable during the cutover. New Firestore records are independent. If old customer, partner or booking data must be preserved, export it from MongoDB when available and run a reviewed one-time import before deleting or closing the old database. Do not put Atlas credentials into the new `.env`.
