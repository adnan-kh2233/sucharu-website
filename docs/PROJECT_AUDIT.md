# Sucharu project audit — 2026-10-16

## A. Current structure

The workspace contains a nested `Sucharu_Operational` project with `index.html`, `README.md`, `BACKEND_SETUP.md`, an `admin/` UI, and the supplied `assets/images/logo.jpeg` and `cover.jpeg`. The project root is not a Git repository (`git status` reports that no repository exists), so there is no version-control checkpoint to rely on.

## B. Technologies present

- Customer and admin pages: plain HTML.
- Admin interactions: browser JavaScript using Fetch and localStorage.
- Backend: documented as Node.js, Express 5, Mongoose, MongoDB, JWT and bcryptjs. `backend/package.json` and `package-lock.json` are present and dependencies are installed.
- The expected backend source directory is absent. No models, routes, middleware, seed script, `.env.example`, or backend configuration files were found.
- The customer HTML references `css/style.css` and `js/main.js`, neither of which existed in the supplied project at audit time. Those missing frontend files have now been restored as a usable responsive interface and booking client.

## C. Functional status

- Customer page markup includes category discovery, pricing table, booking form and status explainer.
- Before this increment, the page was not styled and its required script was missing; catalog filtering, modal, and form submission did not work.
- The supplied admin HTML and JavaScript describe a login, dashboard, booking list, partner list and service pricing editor, but these features cannot be confirmed functional because their API server is missing.
- Current customer catalog entries are explicitly illustrative frontend estimates. The frontend sends booking requests to the configured API and reports unavailability; it does not claim a booking succeeded or persist a fake booking.

## D. Missing or incomplete features

No cart, customer account, service detail pages, quote workflow, database-backed catalog, scheduling/availability validation, provider portal, payments, notifications, reviews, invoices, reporting or deployment setup exists in the supplied source. `BACKEND_SETUP.md` describes commands and files which are absent, including `src/server.js`, `src/utils/seed.js`, and `.env.example`.

## E. Database/backend status

Cannot verify a database connection or backend startup: no backend source or environment file is present. The npm manifest identifies intended dependencies only; it does not constitute an implemented backend.

## F. Admin status

The admin page and script are present. The script expects `/auth/login`, `/dashboard/summary`, `/bookings`, `/partners`, and `/services` endpoints, all unavailable until the missing backend is implemented. JWTs are stored in localStorage. Admin table values are inserted using `innerHTML` without escaping, creating an XSS risk if API fields are attacker controlled. The default credential guidance in the setup document is unsafe for production.

## G. Branding and assets

Preserve and reuse `assets/images/logo.jpeg` and `assets/images/cover.jpeg`. The restored CSS uses the supplied cover and green palette inferred from the existing page. No substitute brand assets were introduced.

## H. Critical risks

1. The operational backend documented by the project is absent; bookings and admin actions cannot work.
2. Admin rendering uses unescaped remote fields in HTML.
3. The admin JWT is persisted in localStorage, where an XSS flaw can read it.
4. The customer form's old copy said booking was a demo while README claimed it calls an API; behavior and documentation conflicted.
5. No `.env.example`, real service availability rules, payment verification, authorization implementation, or automated tests are present.
6. No Git repository was found; use a backup before broad changes.

## I. Recommended architecture

Retain the existing vanilla HTML/CSS/JS frontend and intended Node/Express/Mongoose modular monolith. Add server-side validated API modules for auth, catalog, customer bookings, admin operations and providers; establish role-based authorization and environment-driven configuration. Keep guest booking and a database-backed catalog as early milestones. Treat payment gateways and notifications as disabled until onboarded and verified. Avoid framework migration at this stage.

## J. Prioritized roadmap

1. Phase 0 (this increment): document actual files and risks; restore missing customer CSS/JS without claiming backend success.
2. Phase 1: build a runnable backend, environment example, health route, Mongo connection, validation, centralized error handling, auth/role middleware and safe seed workflow. Fix admin escaping/token handling.
3. Phase 2: catalog/category models and admin/catalog API, then switch customer rendering from illustrative data to API data.
4. Phase 3: server-priced cart, quote/fixed-price distinction, per-item scheduling and booking creation with conflict validation.
5. Phase 4–6: customer accounts, admin operations and isolated provider access.
6. Phase 7–10: verified payment integration, notifications, reporting, tests, security hardening and deployment checklist.

## K. Required configuration

No secrets or external credentials were present. MongoDB URI, production JWT secret, approved service zones, actual business contact details, final service prices, provider/payment onboarding, email/SMS/WhatsApp credentials and deployment domain will be required for corresponding stages. Do not use the setup document's sample admin password for real deployment.

## Work completed in this increment

- Added `css/style.css` to restore responsive styling around the existing brand assets.
- Added `js/main.js` to make catalog search/filtering, booking modal, mobile navigation, price display, phone validation and real API submission work from the frontend.
- Submission errors now clearly explain that the booking API is unavailable; the UI does not create false success or claim durable booking storage.
- Added this audit and implementation roadmap.

## Known limitations / next step

Catalog entries and estimates remain frontend examples because no catalog API or database source exists. The admin panel remains blocked by the missing API. Next implement Phase 1 backend recovery and database-backed catalog, then replace the illustrative client catalog. No tests were executed in this increment.

## User-provided business setup update — 2026-10-16

The owner provided the following launch details, now reflected on the customer site and README:

- Initial service zones: Sonadanga, Khulna Sadar, Khalishpur and Daulatpur; other Khulna City Corporation areas require manual confirmation.
- Call, WhatsApp and Telegram number: 01303-434078.
- Email: adnankhandoker77@gmail.com.
- Office address: 78/5 Sruti Villa, Sonadanga R/A 3rd Phase, Sonadanga, Khulna.
- Requested payment choices: cash on service, bKash and Nagad. The form records a requested payment preference. bKash/Nagad guidance is manual and says to wait for booking and amount confirmation; gateway checkout and payment verification are not implemented.
- Starting price estimates are displayed as estimates and can be changed. They were informed by publicly listed Khulna service prices, but still require the owner's operational approval.

Files updated in this increment: `index.html`, `js/main.js`, `css/style.css`, `README.md`, and `BACKEND_SETUP.md`.

## Phase 1 implementation update — 2026-10-16

Created the first backend implementation: Express app, Mongo connection helper, service/booking/admin/partner models, auth middleware, route modules, environment checks, and an idempotent seed utility. The customer catalog now fetches active services from the API and clearly falls back to marked examples when the API is offline. The admin pages use the implemented route shapes; dynamic table values are escaped, and financial summary copy no longer describes completed booking estimate totals as margin.

Added four automated unit tests. `npm test` passes 4/4. JavaScript syntax checks pass for backend source, tests, customer code and admin code.

### Environment correction

The first `rg --files` listing omitted ignored dotfiles. A local `.env` and `.env.example` were present. The local file matched the original example settings and is not configured for a live database. No MongoDB server was detected at `127.0.0.1:27017`. The updated `.env.example` now documents the required settings. Secret values were not displayed or copied into documentation.

### Current backend limits

Live API/database behavior is not verified because no database is reachable and the local environment still has starter credentials. The current API records bookings as requests and copies the price estimate from the database. It does not reserve confirmed slots or prevent two requests for the same time, perform provider assignment, support customer/provider logins, or process/verify payments. Do not accept real payments or treat bookings as confirmed yet.

### Owner setup needed before live API verification

Create/provide a MongoDB development connection and update local `backend/.env`; choose an admin login email and set the private password locally. Do not send database credentials or the admin password in chat. Exact setup steps are in `BACKEND_SETUP.md`.

### Test update

`npm ci --ignore-scripts --no-audit --no-fund` installed the lockfile dependencies after the default sandbox could not resolve `registry.npmjs.org`. The local-server API contract tests required loopback access and passed with the approved test run. Final result: `npm test` passed 8/8. The seed command was also checked against the starter environment and correctly refused to create an admin using the placeholder JWT secret. No database was written.
