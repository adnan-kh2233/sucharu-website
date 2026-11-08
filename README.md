# Sucharu Operational V1

Customer-facing site and an initial admin interface for Sucharu, serving selected Khulna City Corporation areas.

This repository tracks the website and its Firebase-backed API. The native Android customer app is maintained in a separate repository so the two projects have independent Git history while sharing the same backend API.

## Current implementation

- Existing Sucharu logo and cover assets, responsive customer site, service discovery and booking form.
- Node.js/Express backend using Firebase Cloud Firestore for accounts, services, partners, bookings, and dashboard data.
- Service estimates are editable seed data and not final approved prices.
- COD, bKash and Nagad are recorded as payment preferences. Manual MFS instructions require Sucharu to confirm the booking and amount first. No payment gateway is integrated.

## Local setup

See [BACKEND_SETUP.md](BACKEND_SETUP.md) for Firebase setup and local run commands. The backend needs the private Firebase Admin service-account file and local `.env`. Do not share the service-account file, admin password or JWT secret in chat.

Serve the customer and admin pages with VS Code Live Server. The API expects the corresponding Live Server origin in `backend/.env` under `CLIENT_URL`.

## Run the available tests

```powershell
cd backend
npm test
```

These cover booking rules and API request validation. End-to-end database workflows use the configured Firestore project.

See `docs/PROJECT_AUDIT.md` for the audit, completed work and remaining roadmap.


