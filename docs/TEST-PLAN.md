# Workforce Analytics Platform — Test Plan

Run the commands in the root README from the specified package folder. Record the actual date, environment and output before submission. Do not mark a test as passed until it has been run.

## Automated backend tests

| ID | Area | Test | Expected result |
|---|---|---|---|
| BE-01 | Dashboard | KPI consistency and attendance trend | KPI totals and trend values are consistent |
| BE-02 | Filters | Department/location filters | Results are narrowed to selected filters |
| BE-03 | Employees | Search, sorting and pagination | Correct employee rows and total count |
| BE-04 | SQL security | Injection-like search text | Treated as data; tables remain intact |
| BE-05 | RBAC | Employee self scope | Only linked employee row is returned |
| BE-06 | RBAC | Department scope | Only assigned department rows are returned |
| BE-07 | Authentication | Correct email/password | JWT and session are issued |
| BE-08 | Authentication | Wrong selected role portal | HTTP 403; no session is created |
| BE-09 | Session | Refresh-token rotation | Old refresh token cannot be reused |
| BE-10 | Session | Refresh-token reuse | Associated session is revoked |
| BE-11 | Lockout | Five failed passwords | Account is locked for 15 minutes |
| BE-12 | MFA | TOTP enrollment | Encrypted secret is stored and MFA is enabled only after verification |
| BE-13 | API security | Request without access token | Protected API returns HTTP 401 |
| BE-14 | RBAC | Employee requests organisation dashboard | HTTP 403 |
| BE-15 | Audit | Authentication events | Security events are written to audit_logs |

Command:

```powershell
cd server
npm run typecheck
npm test
```

## Automated frontend tests

| ID | Area | Test | Expected result |
|---|---|---|---|
| FE-01 | API guards | Dashboard payload | Valid payload accepted; malformed KPI rejected |
| FE-02 | API guards | Employee page payload | Valid paginated payload accepted |
| FE-03 | API guards | Employee personal dashboard | Valid personal payload accepted |
| FE-04 | API guards | Audit log payload | Valid audit page accepted |

Commands:

```powershell
cd client
npm run typecheck
npm test
npm run build
```

## Manual browser checks

| ID | Check | Expected result |
|---|---|---|
| UI-01 | Open each of the five login portals | Correct role portal is selected |
| UI-02 | Sign in with matching role account | Login succeeds |
| UI-03 | Sign in through the wrong role portal | Login is rejected with a role mismatch message |
| UI-04 | Admin/HR navigation | Dashboard, Employees, Security and Audit Logs are available |
| UI-05 | Manager/Team Lead navigation | Dashboard and Employees show department-scoped data |
| UI-06 | Employee navigation | Personal dashboard, own employee record and Security are available |
| UI-07 | Employee opens organisation-wide dashboard API | Backend denies access |
| UI-08 | MFA enrollment | QR code can be scanned and a valid code enables MFA |
| UI-09 | MFA login | Correct authenticator code completes sign-in |
| UI-10 | Session management | Another session can be revoked; current session cannot be revoked from this page |
| UI-11 | Theme and responsive layout | Light/dark and desktop/tablet/mobile layouts work |
| UI-12 | Loading/error/empty states | Appropriate state is displayed and retry works |

## Execution record

Fill this section after running the tests on the target Windows development machine.

- Date/time:
- Node version:
- npm version:
- Backend typecheck:
- Backend tests:
- Frontend typecheck:
- Frontend tests:
- Frontend production build:
- Manual browser checks:
- Known issues:
