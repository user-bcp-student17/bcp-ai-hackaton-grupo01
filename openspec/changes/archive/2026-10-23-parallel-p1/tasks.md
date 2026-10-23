# Tasks

## 1. Implement atomic SQLite payment and persistent retry identity
<!-- issue: area=backend size=M priority=p1 agent=auto files=api/src/features/payments/application/transfer.ts,api/src/features/payments/adapters/persistence/,api/db/migrations/004-payments.sql -->
- [x] 1.1 Implement `004-payments.sql` and one transaction owning key check, conditional debit/credit and payment/key per `../payments/design.md#contracts`; use a fake contact reader, no import from the contacts feature.
- [x] 1.2 Implement restart-safe sender-key and participant-ID queries, busy/rollback handling and the receiver balance cap; verify no adapter imports across features.
- [x] 1.3 Test with a real temporary SQLite: success, business failures, injected pre-commit failure, concurrent same/distinct keys and repeat after restart without double debit.

## 2. Expose transfer and recovery routes
<!-- issue: area=backend size=S priority=p1 agent=auto files=api/src/features/payments/adapters/http/,api/src/app.ts -->
- [x] 2.1 Register POST /payments, GET /payments/by-key/:key before GET /payments/:id under /api/v1 over a fake payment port; verify bearer/active guards and strict schemas.
- [x] 2.2 Map replay 200/new 201 and safe 400/404/409/503; omit raw retry keys from logs; no success on storage failure.
- [x] 2.3 Test inject status/body for new/replay/conflict, bad key, unauthorized/inactive/third-party and storage failure.

## 3. Expose participant receipt and history queries
<!-- issue: area=backend size=S priority=p1 agent=auto files=api/src/features/receipt-history/,api/src/app.ts -->
- [x] 3.1 Implement GET /payments and /payments/:id/receipt under /api/v1 over a fake payment-query port; verify no write side effect and no new receipt model.
- [x] 3.2 Apply active participant authorization and createdAt DESC then id DESC ordering; unrelated ID returns the same 404 as missing.
- [x] 3.3 Test inject: incoming/outgoing, empty, order, both participants and third-party denial.

## 4. Add contact search, save and selection interface
<!-- issue: area=frontend size=M priority=p1 files=web/src/features/contacts/,web/src/App.tsx -->
- [x] 4.1 Add phone search, explicit add and own-contact list/selection using Contract mocks of the API client; verify loading/error/empty/not-found states.
- [ ] 4.2 Bind navigation only after login and clear contact query state on logout; never fabricate a recipient after a failed lookup.
- [ ] 4.3 Test lookup/add/list success and failure via userEvent and mocks, including duplicated add and account switch.

## 5. Build confirmation and uncertainty-safe payment interface
<!-- issue: area=frontend size=M priority=p1 files=web/src/features/payments/,web/src/App.tsx -->
- [x] 5.1 Build amount entry and explicit recipient/amount confirmation; convert decimals via string cents, never floats; use a fake contact list and API mock.
- [x] 5.2 Retain one owner-bound key/payload per intent, handle unknown result via same-key query/retry, clear on logout; no token storage.
- [x] 5.3 Test confirmation, invalid amount, double click, timeout/404 uncertainty, same-key retry and cross-user cleanup.

## 6. Display durable receipt and own transaction history
<!-- issue: area=frontend size=M priority=p1 files=web/src/features/receipt-history/,web/src/App.tsx -->
- [x] 6.1 Render history and receipt from an API mock using the PaymentView Contract; format PEN/direction and show the fictitious-money disclaimer.
- [x] 6.2 Render loading/error/empty/not-found without invented success; invalidate history on a payment-success event.
- [x] 6.3 Test component states and receipt/reference consistency, including unrelated receipt denial.
