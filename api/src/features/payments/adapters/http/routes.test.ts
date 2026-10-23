import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { errorResponseSchema } from "@wallet/contracts";
import { sessionResponseSchema } from "@wallet/contracts/auth";
import { registrationInputSchema } from "@wallet/contracts/onboarding";
import { buildApp } from "../../../../app.js";
import { loadConfig } from "../../../../shared/config.js";
import {
  migrationsDirectory,
  openDatabase,
} from "../../../../shared/database.js";
import { ScryptPasswords } from "../../../onboarding/adapters/persistence/scrypt-passwords.js";
import { SqliteUsers } from "../../../onboarding/adapters/persistence/sqlite-users.js";
import { registerUser } from "../../../onboarding/application/register-user.js";
import {
  PaymentError,
  type PaymentErrorCode,
  type PaymentPort,
  type PaymentRecord,
  type TransferCommand,
  type TransferOutcome,
} from "../../application/ports.js";
import {
  createPaymentResponseSchema,
  paymentResponseSchema,
} from "./schemas.js";

const PASSWORD = "012345";
const KEY = "pay-key_001";
const payment: PaymentRecord = {
  id: "pay-1",
  sourceWalletId: "wallet-1",
  destinationWalletId: "wallet-2",
  recipientType: "contact",
  amountCents: 2500,
  currency: "PEN",
  status: "SUCCEEDED",
  createdAt: "2026-10-23T16:00:00.000Z",
};
const senderWallet = { id: "wallet-1", currency: "PEN" as const, balanceCents: 97_500 };
const validBody = {
  recipientType: "contact",
  recipientWalletId: "wallet-2",
  amountCents: 2500,
  currency: "PEN",
};

// In-memory stand-in for the payment use case: records calls and returns scripted results.
class FakePayments implements PaymentPort {
  readonly transfers: TransferCommand[] = [];
  transferResult: TransferOutcome | PaymentErrorCode = {
    outcome: "created",
    payment,
    wallet: senderWallet,
  };
  keyedPaymentOwner: string | null = null;
  visibleTo = new Set<string>();

  transfer(command: TransferCommand): TransferOutcome {
    this.transfers.push(command);
    if (typeof this.transferResult === "string") {
      throw new PaymentError(this.transferResult);
    }
    return this.transferResult;
  }
  findByKey(sourceUserId: string): PaymentRecord | null {
    return sourceUserId === this.keyedPaymentOwner ? payment : null;
  }
  findForParticipant(viewerUserId: string, paymentId: string): PaymentRecord | null {
    return this.visibleTo.has(viewerUserId) && paymentId === payment.id
      ? payment
      : null;
  }
}

let directory: string;
let database: ReturnType<typeof openDatabase>;
const apps: FastifyInstance[] = [];

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "payment-routes-"));
  database = openDatabase(join(directory, "wallet.sqlite"), migrationsDirectory);
  const users = new SqliteUsers(database);
  const passwords = new ScryptPasswords();
  let counter = 0;
  const register = registerUser({
    users,
    passwords,
    kyc: {
      verify: ({ documentNumber }) =>
        Promise.resolve({
          kycStatus: documentNumber === "22222222" ? "pendiente" : "activa",
          simulated: true,
        }),
    },
    now: () => "2026-10-23T16:00:00.000Z",
    newId: () => `id-${String(++counter)}`,
    openingBalanceCents: 100_000,
  });
  for (const documentNumber of ["11111111", "22222222", "33333333"]) {
    await register(
      registrationInputSchema.parse({
        documentType: "DNI",
        documentNumber,
        phone: `91234567${documentNumber.slice(0, 1)}`,
        email: `${documentNumber}@example.test`,
        password: PASSWORD,
      }),
    );
  }
});

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  if (database.isOpen) database.close();
  rmSync(directory, { recursive: true });
});

async function start(payments?: PaymentPort): Promise<FastifyInstance> {
  const app = await buildApp({
    config: loadConfig({
      NODE_ENV: "test",
      DATABASE_PATH: join(directory, "wallet.sqlite"),
    }),
    database,
    logger: false,
    payments,
  });
  apps.push(app);
  return app;
}

async function sessionFor(app: FastifyInstance, documentNumber: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    payload: { documentType: "DNI", documentNumber, password: PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  const session = sessionResponseSchema.parse(response.json());
  return { userId: session.user.id, auth: { authorization: `Bearer ${session.accessToken}` } };
}

test("Confirmed contact payment returns 201 with the payment and sender wallet", async () => {
  const fake = new FakePayments();
  const app = await start(fake);
  const sender = await sessionFor(app, "11111111");
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/payments",
    headers: { ...sender.auth, "idempotency-key": KEY },
    payload: validBody,
  });
  expect(response.statusCode).toBe(201);
  expect(createPaymentResponseSchema.parse(response.json())).toEqual({
    payment,
    wallet: senderWallet,
  });
  expect(fake.transfers).toEqual([
    {
      sourceUserId: sender.userId,
      idempotencyKey: KEY,
      recipientWalletId: "wallet-2",
      amountCents: 2500,
    },
  ]);
});

test("Replay with the same key returns 200 with the original payment", async () => {
  const fake = new FakePayments();
  fake.transferResult = { outcome: "replayed", payment, wallet: senderWallet };
  const app = await start(fake);
  const sender = await sessionFor(app, "11111111");
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/payments",
    headers: { ...sender.auth, "idempotency-key": KEY },
    payload: validBody,
  });
  expect(response.statusCode).toBe(200);
  expect(createPaymentResponseSchema.parse(response.json()).payment.id).toBe(payment.id);
});

test.each([
  ["IDEMPOTENCY_CONFLICT", 409],
  ["INSUFFICIENT_FUNDS", 409],
  ["BALANCE_LIMIT_EXCEEDED", 409],
  ["SELF_TRANSFER", 409],
  ["CONTACT_REQUIRED", 409],
  ["RECIPIENT_NOT_FOUND", 404],
  ["VALIDATION_ERROR", 400],
] as const)("Business failure %s maps to %i without a payment body", async (code, status) => {
  const fake = new FakePayments();
  fake.transferResult = code;
  const app = await start(fake);
  const sender = await sessionFor(app, "11111111");
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/payments",
    headers: { ...sender.auth, "idempotency-key": KEY },
    payload: validBody,
  });
  expect(response.statusCode).toBe(status);
  expect(errorResponseSchema.parse(response.json()).error.code).toBe(code);
  expect(response.body).not.toContain('"payment"');
});

test("Malformed Idempotency-Key is rejected before the payment port runs", async () => {
  const fake = new FakePayments();
  const app = await start(fake);
  const sender = await sessionFor(app, "11111111");
  for (const key of ["bad key!", "x".repeat(101), ""]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/payments",
      headers: { ...sender.auth, "idempotency-key": key },
      payload: validBody,
    });
    expect(response.statusCode).toBe(400);
  }
  const missing = await app.inject({
    method: "POST",
    url: "/api/v1/payments",
    headers: sender.auth,
    payload: validBody,
  });
  expect(missing.statusCode).toBe(400);
  expect(fake.transfers).toHaveLength(0);
});

test.each([
  ["fractional amount", { ...validBody, amountCents: 25.5 }],
  ["zero amount", { ...validBody, amountCents: 0 }],
  ["unknown field", { ...validBody, sourceWalletId: "wallet-9" }],
  ["wrong currency", { ...validBody, currency: "USD" }],
])("Strict payment schema rejects %s", async (_label, payload) => {
  const fake = new FakePayments();
  const app = await start(fake);
  const sender = await sessionFor(app, "11111111");
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/payments",
    headers: { ...sender.auth, "idempotency-key": KEY },
    payload,
  });
  expect(response.statusCode).toBe(400);
  expect(fake.transfers).toHaveLength(0);
});

test("Missing or unknown bearer is refused with 401 before input validation", async () => {
  const fake = new FakePayments();
  const app = await start(fake);
  const missing = await app.inject({
    method: "POST",
    url: "/api/v1/payments",
    headers: { "idempotency-key": KEY },
    payload: { not: "valid" },
  });
  expect(missing.statusCode).toBe(401);
  const unknown = await app.inject({
    method: "GET",
    url: `/api/v1/payments/by-key/${KEY}`,
    headers: { authorization: "Bearer not-a-real-token" },
  });
  expect(unknown.statusCode).toBe(401);
  expect(errorResponseSchema.parse(unknown.json()).error.code).toBe("UNAUTHENTICATED");
  expect(fake.transfers).toHaveLength(0);
});

test("Inactive account gets 403 ACCOUNT_INACTIVE and no payment", async () => {
  const fake = new FakePayments();
  const app = await start(fake);
  const inactive = await sessionFor(app, "22222222");
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/payments",
    headers: { ...inactive.auth, "idempotency-key": KEY },
    payload: validBody,
  });
  expect(response.statusCode).toBe(403);
  expect(errorResponseSchema.parse(response.json()).error.code).toBe("ACCOUNT_INACTIVE");
  expect(fake.transfers).toHaveLength(0);
});

test("Recovery by key returns the owner's committed payment", async () => {
  const fake = new FakePayments();
  const app = await start(fake);
  const sender = await sessionFor(app, "11111111");
  fake.keyedPaymentOwner = sender.userId;
  const response = await app.inject({
    method: "GET",
    url: `/api/v1/payments/by-key/${KEY}`,
    headers: sender.auth,
  });
  expect(response.statusCode).toBe(200);
  expect(paymentResponseSchema.parse(response.json())).toEqual({ payment });
});

test("Unrelated or absent key returns 404 PAYMENT_NOT_FOUND", async () => {
  const fake = new FakePayments();
  const app = await start(fake);
  const other = await sessionFor(app, "11111111");
  const response = await app.inject({
    method: "GET",
    url: `/api/v1/payments/by-key/${KEY}`,
    headers: other.auth,
  });
  expect(response.statusCode).toBe(404);
  expect(errorResponseSchema.parse(response.json()).error.code).toBe("PAYMENT_NOT_FOUND");
});

test("Invalid key in the path returns 400 before lookup", async () => {
  const fake = new FakePayments();
  const app = await start(fake);
  const sender = await sessionFor(app, "11111111");
  const response = await app.inject({
    method: "GET",
    url: "/api/v1/payments/by-key/bad%20key",
    headers: sender.auth,
  });
  expect(response.statusCode).toBe(400);
});

test("Participant lookup by id returns the payment to a participant and 404 to others", async () => {
  const fake = new FakePayments();
  const app = await start(fake);
  const participant = await sessionFor(app, "11111111");
  const stranger = await sessionFor(app, "33333333");
  fake.visibleTo.add(participant.userId);
  const allowed = await app.inject({
    method: "GET",
    url: `/api/v1/payments/${payment.id}`,
    headers: participant.auth,
  });
  expect(allowed.statusCode).toBe(200);
  expect(paymentResponseSchema.parse(allowed.json())).toEqual({ payment });
  const denied = await app.inject({
    method: "GET",
    url: `/api/v1/payments/${payment.id}`,
    headers: stranger.auth,
  });
  expect(denied.statusCode).toBe(404);
  expect(errorResponseSchema.parse(denied.json()).error.code).toBe("PAYMENT_NOT_FOUND");
});

test("Storage failure returns 503 and never a success body", async () => {
  const fake = new FakePayments();
  fake.transferResult = "STORAGE_UNAVAILABLE";
  const app = await start(fake);
  const sender = await sessionFor(app, "11111111");
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/payments",
    headers: { ...sender.auth, "idempotency-key": KEY },
    payload: validBody,
  });
  expect(response.statusCode).toBe(503);
  expect(errorResponseSchema.parse(response.json()).error.code).toBe("STORAGE_UNAVAILABLE");
  expect(response.body).not.toContain('"payment"');
});

test("Without a configured payment adapter every payment call fails closed with 503", async () => {
  const app = await start();
  const sender = await sessionFor(app, "11111111");
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/payments",
    headers: { ...sender.auth, "idempotency-key": KEY },
    payload: validBody,
  });
  expect(response.statusCode).toBe(503);
  expect(response.body).not.toContain('"payment"');
});
