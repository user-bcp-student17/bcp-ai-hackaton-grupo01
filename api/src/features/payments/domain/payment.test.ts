import { describe, expect, test } from "vitest";
import { isPayableAmount, paymentFingerprint } from "./payment.js";

const MAX_PAYMENT_CENTS = 50_000;
const RECIPIENT_WALLET_ID = "wallet-recipient";

describe("isPayableAmount", () => {
  test("accepts the smallest and the configured maximum amount in cents", () => {
    expect(isPayableAmount(1, MAX_PAYMENT_CENTS)).toBe(true);
    expect(isPayableAmount(MAX_PAYMENT_CENTS, MAX_PAYMENT_CENTS)).toBe(true);
  });

  test("rejects an amount above the configured maximum", () => {
    expect(isPayableAmount(MAX_PAYMENT_CENTS + 1, MAX_PAYMENT_CENTS)).toBe(false);
  });

  test("rejects zero and negative amounts", () => {
    expect(isPayableAmount(0, MAX_PAYMENT_CENTS)).toBe(false);
    expect(isPayableAmount(-100, MAX_PAYMENT_CENTS)).toBe(false);
  });

  test("rejects fractional cents", () => {
    expect(isPayableAmount(10.5, MAX_PAYMENT_CENTS)).toBe(false);
  });
});

describe("paymentFingerprint", () => {
  test("gives the same fingerprint for the same payload, whatever the key order", () => {
    const first = paymentFingerprint({ recipientWalletId: RECIPIENT_WALLET_ID, amountCents: 1500 });
    const reordered = paymentFingerprint({ amountCents: 1500, recipientWalletId: RECIPIENT_WALLET_ID });
    expect(reordered).toBe(first);
  });

  test("changes when the amount changes, so a reused key with another amount conflicts", () => {
    expect(paymentFingerprint({ recipientWalletId: RECIPIENT_WALLET_ID, amountCents: 1500 })).not.toBe(
      paymentFingerprint({ recipientWalletId: RECIPIENT_WALLET_ID, amountCents: 1501 }),
    );
  });

  test("changes when the recipient changes, so a reused key with another recipient conflicts", () => {
    expect(paymentFingerprint({ recipientWalletId: RECIPIENT_WALLET_ID, amountCents: 1500 })).not.toBe(
      paymentFingerprint({ recipientWalletId: "wallet-other", amountCents: 1500 }),
    );
  });
});
