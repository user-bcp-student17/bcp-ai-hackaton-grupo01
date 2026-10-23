## Contracts

No new API shapes, tables or env vars. Every group builds against the existing
Contracts and may not alter them:

- payments (`PaymentView`, `POST /payments`, `GET /payments/by-key/:key`,
  `GET /payments/:id`, migration `004-payments.sql`):
  `../payments/design.md#contracts`
- receipt-history (`GET /payments`, `GET /payments/:id/receipt`):
  `../receipt-history/design.md#contracts`
- contacts (lookup, add, list): `../contacts/design.md#contracts`
- common errors and env: `../scaffold/design.md#contracts`; auth:
  `../auth/design.md#contracts`; wallet: `../onboarding/design.md#contracts`

## Context

Replaces six blocked groups with independent ones. Approved p1, after the p0 cutoff.

## Goals / Non-Goals

**Goals:** every group startable now, no `depends=`, finishable with only its own files.
**Non-Goals:** changing Contracts, real cross-group integration, new scope.

## Decisions

- Backend groups depend on a port, not on the group that implements it: payments
  persistence uses a fake contact reader; payments routes a fake payment port;
  receipt API a fake query port. Tests use `inject` or a temporary SQLite.
- Frontend groups test against contract mocks of the API client; never call a
  backend that another group may not have merged.
- `packages/contracts/src/payments.ts` and `contacts.ts` belong to in-progress
  groups (`payments:1`, `contacts:1`). Use them if already merged. Otherwise
  declare the minimal types locally in your own feature folder and do not create or
  edit those files; the demo-cutoff integration pass reconciles them.
- Each group edits only its own feature folder, plus one additive line in
  `api/src/app.ts` or `web/src/App.tsx` to register itself.

## Risks / Trade-offs

[Duplicated minimal types until the shared schemas merge] -> local, small,
reconciled at the cutoff; never exported from contracts.
[Conflicts in `app.ts` / `App.tsx`] -> additive one-line registrations; `rebase`.
[Fakes drift from the real adapter] -> fakes implement the same port and Contract;
the cutoff integration pass runs the real journey.

## Migration Plan

None. Migration `004-payments.sql` is owned by the payments persistence group.

## Traceability

Each group's tests map to the scenarios in `specs/parallel-delivery/spec.md` plus
the scenarios of the original change it replaces.
