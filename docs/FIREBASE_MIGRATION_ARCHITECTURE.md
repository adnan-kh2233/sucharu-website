# Sucharu Firebase Migration — Architecture and Cutover Status

**Status:** The Express API now uses Firebase Admin SDK and Cloud Firestore for operational data. Historic MongoDB records were not copied because Atlas was unavailable during cutover. Existing client sessions still use the API JWT flow by default.

## Current system facts

- Customer/admin/partner web pages are plain HTML, CSS, and JavaScript.
- The Node.js/Express API uses Firebase Admin SDK and Cloud Firestore collections `admins`, `customers`, `partners`, `services`, and `bookings`.
- Passwords are stored as bcrypt hashes in server-managed Firestore documents. API sessions use JWTs by default; customer Firebase custom tokens are available behind the existing mode setting.
- Booking documents contain a customer snapshot and service snapshot; partner assignment is embedded. Historical bookings may not have a `customerId`.
- Android requirement: the Sucharu app must be native Android and written in Java only; Kotlin is not allowed. The existing `sucharu-android` Expo starter is not the Android implementation and will not be used for it. No Java Android source or Firebase Android configuration was found in this workspace.
- Firebase project `sucharu-87667` is configured locally. The Firestore seed created the admin and seven starter services. Historic MongoDB records are not in Firestore.

## Target architecture

```text
Sucharu website ─┐
Native Java Android app ─┼── Firebase Authentication session ── Firestore
Admin panel ─────┘                 │                      ▲
                                   └── HTTPS API ─────────┘
                                       Firebase Admin SDK
```

All three clients use one Firebase project and one Firestore database. Firebase Auth provides the shared user identity. The existing Express API remains the trusted path for booking creation, partner assignment, status changes, payment verification, and other writes that affect money or access. During the transition, MongoDB becomes a read-only rollback copy after the Firebase cutover; it is not a second operational database.

### Authentication choice for Sucharu

The existing customer requirement is **phone or email + password**, without an SMS code on each login. Firebase's built-in password provider uses email/password, while its built-in phone sign-in verifies an SMS code. To preserve the current phone/email-plus-password experience, the proposed design uses Firebase **custom authentication**:

1. Website or native Java Android app submits the identifier and password to the Express API over HTTPS.
2. The API resolves the account, verifies its bcrypt hash, and creates a Firebase custom token for that user's Firebase UID.
3. The client signs in to Firebase with the custom token and uses the resulting Firebase ID token for Firestore/API access.
4. A server-only `authCredentials/{uid}` record holds the bcrypt hash. Firestore client rules deny access to this collection.

This is more custom backend work than email/password-only auth, but it supports the requested phone-or-email login consistently on web and Android. Firebase documents custom tokens for integrating an existing authentication system, and documents email/password and phone/SMS as separate sign-in methods: [custom auth](https://firebase.google.com/docs/auth/admin/create-custom-tokens), [phone auth](https://firebase.google.com/docs/auth/web/phone-auth), [password auth](https://firebase.google.com/docs/auth/web/password-auth).

**Password recovery needs a decision before implementation.** Recommendation: send a reset link to a verified email when the user has one; for phone-only accounts, use SMS OTP only during password recovery. If you want no OTP at any time, phone-only accounts will need a carefully verified admin-assisted recovery process instead.

### Firestore collections

| Collection | Document identity and key fields | Access intent |
|---|---|---|
| `users/{uid}` | Firebase UID, `role`, name, email, phone, active flags, timestamps | User can read own profile; admin can manage roles. Clients cannot write roles or active flags. |
| `authCredentials/{uid}` | bcrypt password hash and credential timestamps | Server only. No website, Android, worker, or admin client reads. |
| `workers/{uid}` | Firebase UID, partner ID, categories, service areas, verification, status, completed jobs | Worker and admin access; assigned-worker details exposed only where needed. |
| `services/{serviceId}` | name, slug, category, description, price estimate, payout estimate, active, timestamps, legacy Mongo ID | Public read of active catalog; writes through admin API. |
| `bookings/{documentId}` | public booking ID, customer UID, worker UID, service ID/snapshot, schedule, area, address, payment preference/status, booking status, timestamps, legacy Mongo ID | Customer reads own; worker reads assigned; admin manages. Client cannot assign workers or set payment/completion status. |
| `payments/{paymentId}` | booking ID, amount, method, provider reference, verification state, payout/commission values, timestamps | Created/updated by trusted server only; customer/admin receive limited reads. No card, PIN, OTP, or gateway secret is stored. |
| `reviews/{reviewId}` | customer UID, booking ID, rating, comment, timestamps | Customer creates for eligible own booking; admin moderates. |
| `notifications/{notificationId}` | recipient UID, type, booking ID, message data, read state, timestamps | Recipient reads own; trusted backend creates. |
| `settings/{documentId}` | service zones, business settings, feature flags, timestamps | Admin/server only. |
| `migrationMappings/{sourceKey}` | source collection, Mongo ID, destination UID/document ID, migration state | Temporary/server-only migration audit. Remove only after migration verification and retention decision. |

`categories` and `transactions` can be added later if the business needs them. Current services use a category string and current payment/commission workflows do not justify separate operational collections yet. Booking snapshots (service name/price and customer contact/address) are intentionally denormalized so historical bookings remain readable if catalog/profile data changes; current values still live in `services` and `users`.

### Identity and legacy ID mapping

- Firebase UID becomes the user key in `users`, `workers`, and booking ownership fields.
- Generate a migration mapping for each Mongo user `_id`; do not assume a Mongo ObjectId is already a Firebase UID.
- Keep Mongo IDs in migration metadata and, where useful, on migrated service/booking documents as `legacyMongoId` so references can be checked and rollback reconciled.
- Link old bookings to customers only when an explicit relationship exists or a reviewed, unambiguous match is established. Do not silently merge by name or phone where duplicates/conflicts exist.
- Existing bcrypt password hashes may be candidates for Firebase Auth BCRYPT import, but the chosen custom-auth design can preserve and verify bcrypt hashes server-side. A sample-account migration must confirm the selected route before bulk migration. Firebase's import documentation lists BCRYPT support: [Import users](https://firebase.google.com/docs/auth/admin/import-users).

## Security and server responsibilities

- Firestore rules default-deny. Customers can only read their own account/bookings; workers only assigned work; admin privileges come from trusted server-set Firebase custom claims.
- Clients cannot set `role`, worker verification, booking assignment/status, payment status, commission, or payout.
- Express verifies Firebase ID tokens and role claims before privileged operations. Firebase Admin SDK server libraries bypass Firestore Security Rules, so every API handler must still enforce authorization: [Firestore rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions).
- Rules and server checks both validate allowed fields/status transitions. Sensitive reads such as a worker's assigned customer address are limited to that assigned booking.
- Firebase Admin credentials stay on the backend using server environment/application credentials. Never commit a service-account key or paste it into chat. Firebase web configuration is not a service-account credential, but it still belongs in the intended app configuration.
- Storage and FCM are later phases. Initially, keep document uploads and push notifications out of the migration until their access rules and operational need are defined.

## Initial indexes to plan

- Customer booking history: `customerUid == uid`, ordered by `createdAt` descending.
- Worker's assignments: `workerUid == uid`, filtered by active status, ordered by schedule date.
- Admin queue: status plus schedule/created date; worker plus schedule for workload/conflict views.
- Review queries: booking ID or service ID plus creation date.

Exact composite indexes will be finalized from the queries retained in the API; Firestore can report missing indexes during staging verification.

## Migration and cutover sequence

1. **Manual before migration:** create/select the Firebase project and confirm which existing Android project is the real app. Do not put credentials in chat.
2. Create a complete MongoDB backup in a private local location; record the source database, collections, document counts, and a checksum.
3. Export a read-only inventory and map each current model/field/reference to the Firestore schema above. Reconcile bookings with missing customer/worker references.
4. Configure Firebase Auth, Firestore, role claims, and deny-by-default rules in a development project. Keep production rules closed until reviewed.
5. Implement Firebase Admin-backed repositories behind the existing API route shapes. Preserve validation and business behavior before switching the website/app.
6. Migrate a copy of data to staging, including the user-ID mapping. Compare collection counts and sampled fields/statuses. Exercise cross-role security and booking flows.
7. Switch website/admin/Android clients to Firebase Auth and Firestore/API, then observe the same data from each client.
8. Keep MongoDB untouched and read-only as rollback until the owner accepts migration verification. Decommission only after explicit approval.

The historical Phase 1–2 review did not perform database writes. The later cutover in the implementation status below seeded Firestore through the Firebase Admin SDK.

## Phase 3 manual items

- The owner created Firebase project `sucharu-87667`, enabled Firestore in `asia-south1` (Mumbai) with production-mode rules, and registered the `Sucharu Website` web app. The API seed created its admin and seven starter service documents.
- Firebase Authentication was opened, but no built-in sign-in providers were enabled. The planned customer login uses custom tokens from the existing API, so SMS/Phone and Email/Password providers remain off.
- The actual native Java Android app is deferred until after the website/backend work. The existing `sucharu-android` Expo starter is not the Android implementation and will not be converted to Kotlin.
- The owner should choose password recovery: verified email reset plus SMS OTP for phone-only accounts (recommended), or admin-assisted recovery with an agreed identity check.
- Do not send a service-account private key in chat. Once the Firebase project exists, use a secure local configuration path for backend credentials and share only non-secret project/app identifiers when needed.

### Website-first implementation status

- Added the Firebase Web SDK bootstrap for the registered website and Firebase Admin SDK support for the Express API.
- The API reads and writes admin, customer, partner, service, booking and dashboard data in Firestore. Startup and health checks no longer require MongoDB.
- Customer login/register can return Firebase custom tokens when `CUSTOMER_AUTH_MODE=firebase`. The default remains the existing API JWT response so the current clients remain compatible while Firebase client sign-in is completed.
- MongoDB was removed from the backend runtime and dependencies. Historic Atlas records were not copied; only the admin and seven starter services have been seeded. Preserve/export any old Atlas data separately if it is still needed.
- The backend service-account key must remain outside version control and must never be pasted into chat. The Java Android app can be registered later using its final package name/applicationId.
