# Tasks

## 1. Implement hashed session persistence and credential verification
<!-- issue: area=backend size=M priority=p0 agent=auto depends=scaffold:2,onboarding:1 files=api/src/features/auth/application/,api/src/features/auth/adapters/persistence/,api/db/migrations/002-auth.sql,packages/contracts/src/auth.ts -->
- [x] 1.1 Implement session schemas/use cases and 002 migration using onboarding lookup/verification ports; verify random opaque tokens are hashed in storage.
- [x] 1.2 Implement one-hour expiry/revocation, generic credential failures and rate-limit key policy; verify clock-controlled expiry and unknown-user dummy verification.
- [x] 1.3 Test real SQLite sessions across restart, incorrect/unknown credentials, non-active login, revoke and no second wallet funding.

## 2. Expose login, logout and owner-only account routes
<!-- issue: area=backend size=M priority=p0 agent=auto depends=scaffold:2,1,onboarding:2 files=api/src/features/auth/adapters/http/,api/src/shared/auth.ts,api/src/app.ts -->
- [x] 2.1 Wire POST /sessions, DELETE /sessions/current and GET /me under /api/v1 with response/error schemas; verify bearer middleware derives owner exclusively.
- [x] 2.2 Apply login rate limits and safe logs; verify missing/expired/revoked tokens fail and pending/rejected users get own status with wallet=null.
- [x] 2.3 Test all routes with inject: valid/invalid/malformed login, 429/Retry-After, two-user ownership, inactive results and logout invalidating old token.

## 3. Deliver login and wallet views with the reduced p0 journey
<!-- issue: area=frontend size=M priority=p0 depends=scaffold:2,1,2,onboarding:3 files=web/src/features/auth/,web/src/lib/session.tsx,web/src/App.tsx,tests/e2e/onboarding.test.ts -->
- [ ] 3.1 Add document-type/number/password login and memory-only session provider; verify token never enters browser persistent storage or URL.
- [ ] 3.2 Render own wallet or non-active status, logout, expiry and cache clearing; verify prior-user/late-response data cannot appear after account switch.
- [ ] 3.3 Test login/UI failures and complete registration-to-wallet journey for all KYC outcomes; exercise local backend persistence and verify no p1 screen is needed for the cutoff.
