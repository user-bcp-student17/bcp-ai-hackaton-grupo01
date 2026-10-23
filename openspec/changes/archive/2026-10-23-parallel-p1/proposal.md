# Proposal

## Why

The remaining p1 groups (contacts UI, payments, receipt-history) were chained by
`depends=`, so workers sat idle behind one another. Their Contracts are already
fixed, so each group can be built and tested alone against fakes and mocks.

## What Changes

- Replace the blocked groups `contacts:2`, `payments:2`, `payments:3`, `payments:4`,
  `receipt-history:1` and `receipt-history:2` with six groups that have no
  `depends=` on each other, each with its own files and test doubles.
- Groups already in progress (`contacts:1`, `payments:1`, auth and onboarding)
  are untouched.
- Out of scope: any change to a Contract in the `contacts`, `payments` or
  `receipt-history` designs, and real cross-group integration (verified at the
  demo cutoff, not by an issue).

## Capabilities

### New Capabilities

- `parallel-delivery`: p1 groups are independently buildable and testable.

### Modified Capabilities

None.

## Impact

Planning only: new issues replace six blocked ones. p1, after the 12:30 Peru p0
cutoff. Small additive conflicts are possible in `api/src/app.ts` and
`web/src/App.tsx`; workers resolve them with `rebase`.
