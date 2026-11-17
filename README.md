# Workforce Analytics Platform (WFA) — Tasks 1, 2 and 3

A full-stack Workforce Analytics Platform built with React, TypeScript, Vite, Material UI, Recharts, Node.js, Express and SQLite. This project preserves the existing Task 1/Task 2 dashboard and employee-directory implementation and extends it with Task 3 authentication, MFA, sessions, audit logging and role-based authorization.

## 1. Technology stack

- **Frontend:** React 18, TypeScript (strict), Vite, Material UI, Recharts
- **Backend:** Node.js 22.13+, TypeScript, Express
- **Database:** SQLite using Node's built-in `node:sqlite`
- **Authentication:** bcrypt password hashing, JWT access tokens, HttpOnly refresh-token cookie and refresh-token rotation
- **MFA:** TOTP authenticator app, QR-code enrollment, encrypted TOTP secrets (AES-256-GCM)
- **Architecture:** reusable React components, API client and response guards, Express routes, services, repository interfaces and SQLite repositories

There is intentionally no root `package.json`. Run frontend and backend commands from their respective folders.

## 2. Prerequisites

- Node.js **22.13 or newer**
- npm
- Windows PowerShell, macOS Terminal or Linux shell

Check versions:

```bash
node --version
npm --version
```

## 3. First-time setup

Open two terminals.

### Terminal 1 — backend

```powershell
cd "path\to\wfa-platform-task2-complete\server"
npm install
npm run setup:env
npm run setup:accounts
npm run dev
```

`npm run setup:env` creates a private `server/.env` containing fresh random JWT and MFA-encryption secrets. It will not overwrite an existing `.env`. Do not commit or share this file.

`npm run setup:accounts` creates or updates the five development accounts. It prompts for each password so plaintext passwords are not stored in source code. Enter the passwords supplied by your project administrator/team lead. Passwords are stored as bcrypt hashes. The Employee account is linked to its own employee record. Manager and Team Lead accounts are assigned to the first seeded department; see the role-scope note below.

The backend automatically creates/migrates `server/data/wfa.db` and seeds 240 sample employees and attendance records when the database is empty.

Expected backend message:

```text
WFA API listening on http://localhost:4000/api
```

### Terminal 2 — frontend

```powershell
cd "path\to\wfa-platform-task2-complete\client"
npm install
npm run dev
```

Open `http://localhost:5173/`.

## 4. Login portals and role permissions

The login page has five role portals. The selected portal is sent to the backend and checked against the role actually assigned to the account in SQLite. Selecting a different portal does not grant extra permissions.

| Role | Dashboard | Employee records | Other permissions |
|---|---|---|---|
| Admin | Organisation-wide | All employees | Manage-user permission, audit-log read |
| HR | Organisation-wide | All employees | Audit-log read |
| Manager | Department-scoped | Own department | Own profile |
| Team Lead | Department-scoped | Own department | Own profile |
| Employee | Personal dashboard | Own employee record only | Own attendance and profile |

**Team Lead scope:** the Task 1/Task 2 database has departments but no team table or team-membership relationship. Therefore Team Lead is currently department-scoped, like Manager. True team-only access requires a team schema and team assignment data; it must not be simulated by frontend filtering.

The account setup utility uses these login IDs:

- `admin@thestackly.com`
- `hr@thestackly.com`
- `manager@thestackly.com`
- `teamlead@thestackly.com`
- `employee@thestackly.com`

The setup utility asks you to enter each password interactively. Demo passwords should be replaced with strong unique passwords before production deployment.

## 5. Task 1 and Task 2 dashboard features

- Responsive sidebar, top navigation, user profile and theme toggle
- Five KPI cards: Total Employees, Present, Absent, On Leave and Attendance Rate
- Attendance trend chart
- Department-wise and location-wise employee distribution
- Workforce status donut chart
- Recent employee attendance activity
- Date-range, department, location and status filters
- Employee search, sorting and pagination
- SQLite-backed employee, department and attendance data
- Loading, error, retry and empty states
- API response guards and validated query parameters
- Repository Pattern and parameterized SQLite queries

## 6. Task 3 authentication and security

- Email/password login and logout
- bcrypt password hashing (cost factor 12)
- JWT access tokens with issuer, audience, algorithm and expiry validation
- Refresh tokens stored as SHA-256 hashes in SQLite and rotated on refresh
- HttpOnly, SameSite refresh-token cookie
- TOTP MFA enrollment with QR code and manual setup key
- AES-256-GCM encryption for TOTP secrets at rest
- MFA verification during sign-in, challenge expiry, attempt limits and TOTP replay protection
- Five failed password attempts trigger a 15-minute account lockout
- Server-side session validation and session revocation
- User session list and revoke controls under **Security & Sessions**
- Login, failed-login, role-mismatch, MFA, refresh, logout and session-revocation audit events
- Admin/HR-protected audit-log API
- Login, MFA and general API rate limiting
- CORS allowlist, JSON request-size limit and security response headers
- Backend permission middleware and SQL-level employee scope restrictions

### MFA setup

1. Sign in normally.
2. Open **Security & Sessions** from the sidebar.
3. Select **Set up authenticator**.
4. Scan the QR code using an authenticator app (for example, Microsoft Authenticator or Google Authenticator).
5. Enter the six-digit code to enable MFA.
6. The next login for that account requires the authenticator code.

Keep the manual setup key private. Do not include it in screenshots or commit it to Git.

## 7. Main API endpoints

### Public / authentication

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/mfa/verify`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/mfa/setup`
- `POST /api/auth/mfa/verify-setup`
- `GET /api/auth/sessions`
- `POST /api/auth/sessions/:id/revoke`

### Authenticated workforce API

- `GET /api/lookups`
- `GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/me/overview?from=YYYY-MM-DD&to=YYYY-MM-DD` (Employee personal dashboard only)
- `GET /api/employees?search=&sortBy=name&order=asc&page=1&pageSize=10`
- `GET /api/audit-logs?limit=50&page=1` (Admin/HR permission)

All workforce endpoints require a valid access token. Authorization is checked by the backend using the user's current database roles and permissions.

## 8. SQLite schema and migrations

Base Task 2 schema:

- `departments`
- `employees`
- `attendance`

Task 3 migrations:

- `002_auth_rbac.sql` — users, roles, permissions, user-role mapping, role permissions, sessions, refresh tokens, MFA factors/challenges and audit logs
- `003_rbac_permissions.sql` — role permission assignments
- `004_user_department.sql` — department relationship for department-scoped users
- `005_employee_self_dashboard.sql` — personal dashboard permission and MFA indexes
- `006_mfa_replay_protection.sql` — TOTP replay-protection state

Migration versions are recorded in `schema_migrations` and applied automatically when the server opens the database.

## 9. Project structure

```text
wfa-platform-task2-complete/
├── client/
│   └── src/
│       ├── components/       # Dashboard, employee, filter and layout components
│       ├── context/          # Authentication and filter state
│       ├── hooks/            # Async, debounce and hash routing hooks
│       ├── pages/            # Dashboard, employee, login and security pages
│       ├── services/         # API clients and runtime response guards
│       └── types/            # Frontend TypeScript models
├── server/
│   ├── scripts/              # Local environment setup
│   └── src/
│       ├── db/                # SQLite connection, seed and migrations
│       ├── domain/            # Domain types
│       ├── repositories/      # SQLite repositories
│       ├── routes/            # API and authentication routes
│       ├── services/          # Dashboard and authentication business logic
│       ├── tests/             # Data-layer and authentication/RBAC tests
│       └── validation/        # API input validation
├── docs/screenshots/          # Dashboard screenshots
└── README.md
```

## 10. Tests and verification

Run these commands after installing dependencies and creating `server/.env`.

Backend:

```powershell
cd server
npm run typecheck
npm test
```

Frontend:

```powershell
cd client
npm run typecheck
npm test
npm run build
```

Backend tests cover dashboard/data consistency, filters, employee pagination/search, SQL injection resistance, employee scope enforcement, authentication, role mismatch, JWT/session validation, refresh-token rotation, MFA secret encryption/setup and account lockout.

Capture fresh screenshots after running the current code, especially the five login portals, Employee personal dashboard, Security & Sessions/MFA setup, and the Admin/HR/Manager/Team Lead dashboards. The screenshots currently in `docs/screenshots` are the Task 2 dashboard baseline and should be refreshed if the UI has changed.

## 11. Submission items to complete

- [ ] Add the actual Figma design URL (not supplied in the task messages)
- [ ] Push the final code to the assigned GitHub repository/branch
- [ ] Run and record the frontend and backend test results
- [ ] Capture fresh screenshots for desktop, tablet and mobile layouts
- [ ] Capture both light and dark dashboard screenshots
- [ ] Capture login portals, MFA enrollment, role access and access-denied demonstrations
- [ ] Prepare a short working demo explaining architecture, SQLite migrations, authentication and RBAC

## 12. Production deployment notes

The supplied role account IDs and simple demo passwords are for local demonstration only. Use strong unique passwords and HTTPS in production. Set `COOKIE_SECURE=true`, use a production-only `FRONTEND_ORIGIN`, protect the environment file and rotate all development secrets. The in-memory rate limiter is suitable for a single local instance; a shared rate-limit store is recommended for multi-instance deployment. Configure a trusted reverse proxy before enabling proxy-aware IP handling.
