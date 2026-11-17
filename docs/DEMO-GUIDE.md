# Workforce Analytics Platform — Demonstration Guide

Suggested 8–10 minute demonstration for the Task 1–3 review.

1. Start the backend and frontend using the root README instructions.
2. Show the five login portals: Admin, HR, Manager, Team Lead and Employee.
3. Demonstrate a correct Admin login and show the organisation-wide dashboard, employee directory, security page and audit logs.
4. Try the Admin credentials through the HR portal to demonstrate that the backend rejects a role mismatch.
5. Sign in as Manager or Team Lead and show that employee results and dashboard analytics are limited to the assigned department.
6. Sign in as Employee and show the personal dashboard, own employee record and attendance history. Explain that the account is linked to its own employee row in SQLite.
7. Open Security & Sessions, start MFA enrollment, scan the QR code with an authenticator app and verify the six-digit code. Sign out and demonstrate the MFA challenge at the next login.
8. Show session records and revoke a different session if one is available.
9. Open Audit Logs as Admin or HR and show login/MFA/session events.
10. Demonstrate light/dark mode, responsive layout, filters, employee search and pagination.
11. Briefly explain SQLite migrations, repository/service separation, backend permission middleware, SQL employee scoping, tests and README setup.

Do not show passwords, JWT values, refresh cookies, MFA manual keys, `.env` contents or other secrets during the presentation.
