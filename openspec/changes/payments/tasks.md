# Tasks

## 1. Define contact-payment rules and exact shared schemas
<!-- issue: area=backend size=S priority=p1 agent=auto depends=scaffold:2,contacts:1 files=api/src/features/payments/domain/,api/src/features/payments/application/ports.ts,packages/contracts/src/payments.ts -->
- [ ] 1.1 Implement immutable PaymentView/request schemas and domain amount/recipient/fingerprint rules; verify all errors follow reviewed Contracts.
- [ ] 1.2 Define transaction/query ports without framework or adapter dependencies; verify interface permits atomic debit-credit-payment-key commit.
- [ ] 1.3 Test positive/cap/fractional/zero amounts, same canonical payload fingerprint and changed-payload conflict deterministically.

## 2. Implement atomic SQLite payment and persistent retry identity
<!-- issue: area=backend size=M priority=p1 depends=scaffold:2,1 files=api/src/features/payments/application/transfer.ts,api/src/features/payments/adapters/persistence/,api/db/migrations/004-payments.sql -->
- [ ] 2.1 Implement 004 and one transaction owning key check, owner/contact guards, conditional debit/credit, payment and key; verify no success before commit.
- [ ] 2.2 Implement restart-safe sender-key and participant-ID queries, busy/rollback handling and recipient cap; verify no adapter imports across features.
- [ ] 2.3 Test real temporary SQLite success, all business failures, injected pre-commit failure, concurrent same/distinct keys and repeat after restart without double debit.

## 3. Expose transfer and recovery routes
<!-- issue: area=backend size=S priority=p1 agent=auto depends=scaffold:2,2 files=api/src/features/payments/adapters/http/,api/src/app.ts -->
- [ ] 3.1 Register POST /payments, GET /payments/by-key/:key before GET /payments/:id under /api/v1; verify auth/active ownership and strict schemas.
- [ ] 3.2 Map replay 200/new 201, safe 400/404/409/503 and omit raw retry-key URLs from logs; verify no misleading success response on storage failure.
- [ ] 3.3 Test inject status/body for new/replay/conflict, bad key, unauthorized/inactive/third-party, same-key recovery and safe storage failure.

## 4. Build confirmation and uncertainty-safe payment interface
<!-- issue: area=frontend size=M priority=p1 depends=scaffold:2,1,3,contacts:2 files=web/src/features/payments/,web/src/App.tsx,tests/e2e/contact-payment.test.ts -->
- [ ] 4.1 Build amount entry and explicit recipient/amount confirmation; convert decimal input using string cents, never floating arithmetic; verify validation.
- [ ] 4.2 Retain one owner-bound key/payload per intent, handle unknown result via same-key query/retry, and invalidate wallet/history on success; verify no token storage and clear attempts on logout.
- [ ] 4.3 Test confirmation, invalid amount, double click, timeout/404 uncertainty, same-key retry and cross-user cleanup; exercise seeded contact payment end to end.
