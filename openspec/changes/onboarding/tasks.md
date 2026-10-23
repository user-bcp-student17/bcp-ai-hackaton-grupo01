# Tasks

## 1. Persist registration identity and wallet affiliation
<!-- issue: area=backend size=M priority=p0 agent=auto depends=scaffold:2 files=api/src/features/onboarding/domain/,api/src/features/onboarding/application/,api/src/features/onboarding/adapters/persistence/,api/db/migrations/001-onboarding.sql,packages/contracts/src/onboarding.ts -->
- [x] 1.1 Implement shared input/UserView/WalletView schemas and user lookup/verification ports per Contracts; verify DNI/CE/phone/email/password cases with schema tests.
- [x] 1.2 Add salted scrypt, 001 migration and transactional user-wallet-opening persistence; verify unique constraints and initial balance granted once.
- [x] 1.3 Test registration data through repository/use-case public surfaces with real temporary SQLite: active/inactive affiliation, uniqueness, rollback, restart, hash secrecy and repeated opening allocation without refilling a changed balance.

## 2. Expose registration and deterministic KYC routes
<!-- issue: area=backend size=M priority=p0 agent=auto depends=scaffold:2,1 files=api/src/features/onboarding/adapters/http/,api/src/features/onboarding/adapters/kyc/,api/src/app.ts -->
- [ ] 2.1 Implement local KYC port and POST /kyc/verification and /users under /api/v1; verify no supplied KYC/balance can override server configuration.
- [ ] 2.2 Wire composition root, safe errors, request throttling and response schemas; verify 201 business outcomes versus 500/503 rollback errors with walletId=null.
- [ ] 2.3 Test both routes using inject: DNI/CE, all three KYC results, extra fields, malformed input, duplicate conflict, mocked technical failure and no secret logging.

## 3. Build registration and KYC status screens
<!-- issue: area=frontend size=M priority=p0 depends=scaffold:2,1 files=web/src/features/onboarding/,web/src/App.tsx -->
- [ ] 3.1 Build registration form using shared schemas and scaffold controls, with pending/rejected/active result views; verify labeled keyboard-accessible controls.
- [ ] 3.2 Connect typed API hooks and handle loading/400/409/429/technical errors without success fallback; verify demo disclaimer and clear next-step login action.
- [ ] 3.3 Test form scenarios with Testing Library and contract-conforming client mocks, including leading-zero password, CE and inactive/error states.
