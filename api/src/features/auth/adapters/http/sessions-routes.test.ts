import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { errorResponseSchema } from "@wallet/contracts";
import {
  accountResponseSchema,
  sessionResponseSchema,
} from "@wallet/contracts/auth";
import { registrationInputSchema } from "@wallet/contracts/onboarding";
import { buildApp } from "../../../../app.js";
import { loadConfig } from "../../../../shared/config.js";
import { migrationsDirectory, openDatabase } from "../../../../shared/database.js";
import { ScryptPasswords } from "../../../onboarding/adapters/persistence/scrypt-passwords.js";
import { SqliteUsers } from "../../../onboarding/adapters/persistence/sqlite-users.js";
import { registerUser } from "../../../onboarding/application/register-user.js";

const passwords = new ScryptPasswords();
const registeredAt = "2026-10-23T16:00:00.000Z";
const PASSWORD = "012345";
const kycByDocument: Record<string, "activa" | "pendiente"> = {
  "11111111": "activa",
  "22222222": "pendiente",
  ABC123456: "activa",
  "33333333": "activa",
};

let directory: string;
let database: ReturnType<typeof openDatabase>;
const apps: FastifyInstance[] = [];

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "auth-routes-"));
  database = openDatabase(join(directory, "wallet.sqlite"), migrationsDirectory);
  const users = new SqliteUsers(database);
  let counter = 0;
  const register = registerUser({
    users,
    passwords,
    kyc: {
      verify: ({ documentNumber }) =>
        Promise.resolve({
          kycStatus: kycByDocument[documentNumber] ?? "rechazada",
          simulated: true,
        }),
    },
    now: () => registeredAt,
    newId: () => `id-${String(++counter)}`,
    openingBalanceCents: 100_000,
  });
  for (const [index, [documentType, documentNumber]] of ([
    ["DNI", "11111111"],
    ["DNI", "22222222"],
    ["CE", "ABC123456"],
  ] as const).entries()) {
    await register(
      registrationInputSchema.parse({
        documentType,
        documentNumber,
        phone: `91234567${String(index)}`,
        email: `${documentNumber.toLowerCase()}@example.test`,
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

async function start(): Promise<FastifyInstance> {
  const app = await buildApp({
    config: loadConfig({
      NODE_ENV: "test",
      DATABASE_PATH: join(directory, "wallet.sqlite"),
    }),
    database,
    logger: false,
  });
  apps.push(app);
  return app;
}

const login = (
  app: FastifyInstance,
  documentType: "DNI" | "CE",
  documentNumber: string,
  password = PASSWORD,
) =>
  app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    payload: { documentType, documentNumber, password },
  });

async function tokenFor(
  app: FastifyInstance,
  documentType: "DNI" | "CE",
  documentNumber: string,
): Promise<string> {
  const response = await login(app, documentType, documentNumber);
  expect(response.statusCode).toBe(201);
  return sessionResponseSchema.parse(response.json()).accessToken;
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

test("Valid login returns a bearer session for the owner", async () => {
  const app = await start();
  const response = await login(app, "DNI", "11111111");
  expect(response.statusCode).toBe(201);
  const body = sessionResponseSchema.parse(response.json());
  expect(body.tokenType).toBe("Bearer");
  expect(body.user.documentNumber).toBe("11111111");
  expect(body.user.active).toBe(true);
  expect(body.accessToken.length).toBeGreaterThan(30);
  expect(response.body).not.toContain(PASSWORD);
});

test("Wrong password and unknown document return the same generic error", async () => {
  const app = await start();
  const wrong = await login(app, "DNI", "11111111", "654321");
  const unknown = await login(app, "DNI", "99999999", PASSWORD);
  expect(wrong.statusCode).toBe(401);
  expect(unknown.statusCode).toBe(401);
  expect(wrong.json()).toEqual(unknown.json());
  expect(errorResponseSchema.parse(wrong.json()).error.code).toBe(
    "INVALID_CREDENTIALS",
  );
});

test("Leading-zero password is accepted and malformed input is a validation error", async () => {
  const app = await start();
  expect((await login(app, "DNI", "11111111", "012345")).statusCode).toBe(201);
  const short = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    payload: { documentType: "DNI", documentNumber: "11111111", password: "12345" },
  });
  expect(short.statusCode).toBe(400);
  expect(errorResponseSchema.parse(short.json()).error.code).toBe(
    "VALIDATION_ERROR",
  );
  const extra = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    payload: {
      documentType: "DNI",
      documentNumber: "11111111",
      password: PASSWORD,
      userId: "id-1",
    },
  });
  expect(extra.statusCode).toBe(400);
});

test("Sixth attempt within the window is throttled with Retry-After and no document data", async () => {
  const app = await start();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    expect((await login(app, "DNI", "33333333", "000000")).statusCode).toBe(401);
  }
  const limited = await login(app, "DNI", "33333333", PASSWORD);
  expect(limited.statusCode).toBe(429);
  const retryAfter = Number(limited.headers["retry-after"]);
  expect(retryAfter).toBeGreaterThan(0);
  expect(retryAfter).toBeLessThanOrEqual(900);
  expect(errorResponseSchema.parse(limited.json()).error.code).toBe(
    "RATE_LIMITED",
  );
  expect(limited.body).not.toContain("33333333");
});

test("Missing, malformed and unknown bearer values get UNAUTHENTICATED", async () => {
  const app = await start();
  const none = await app.inject({ method: "GET", url: "/api/v1/me" });
  const malformed = await app.inject({
    method: "GET",
    url: "/api/v1/me",
    headers: { authorization: "Token abc" },
  });
  const unknown = await app.inject({
    method: "GET",
    url: "/api/v1/me",
    headers: bearer("not-a-real-token"),
  });
  for (const response of [none, malformed, unknown]) {
    expect(response.statusCode).toBe(401);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe(
      "UNAUTHENTICATED",
    );
  }
});

test("/me returns each owner's own user and wallet, never the other's", async () => {
  const app = await start();
  const first = await tokenFor(app, "DNI", "11111111");
  const second = await tokenFor(app, "CE", "ABC123456");
  const firstMe = await app.inject({
    method: "GET",
    url: "/api/v1/me",
    headers: bearer(first),
  });
  const secondMe = await app.inject({
    method: "GET",
    url: "/api/v1/me",
    headers: bearer(second),
  });
  const a = accountResponseSchema.parse(firstMe.json());
  const b = accountResponseSchema.parse(secondMe.json());
  expect(a.user.documentNumber).toBe("11111111");
  expect(b.user.documentNumber).toBe("ABC123456");
  expect(a.wallet?.id).not.toBe(b.wallet?.id);
  expect(a.wallet).toEqual({
    id: a.user.walletId,
    currency: "PEN",
    balanceCents: 100_000,
  });
});

test("/me shows a pending user their own status with wallet null", async () => {
  const app = await start();
  const token = await tokenFor(app, "DNI", "22222222");
  const response = await app.inject({
    method: "GET",
    url: "/api/v1/me",
    headers: bearer(token),
  });
  expect(response.statusCode).toBe(200);
  const body = accountResponseSchema.parse(response.json());
  expect(body.user.kycStatus).toBe("pendiente");
  expect(body.user.active).toBe(false);
  expect(body.wallet).toBeNull();
});

test("Logout revokes the presented session and the old token stops working", async () => {
  const app = await start();
  const token = await tokenFor(app, "DNI", "11111111");
  const logout = await app.inject({
    method: "DELETE",
    url: "/api/v1/sessions/current",
    headers: bearer(token),
  });
  expect(logout.statusCode).toBe(204);
  expect(logout.body).toBe("");
  const after = await app.inject({
    method: "GET",
    url: "/api/v1/me",
    headers: bearer(token),
  });
  expect(after.statusCode).toBe(401);
  const again = await app.inject({
    method: "DELETE",
    url: "/api/v1/sessions/current",
    headers: bearer(token),
  });
  expect(again.statusCode).toBe(401);
});

test("Logout rejects extra input naming another user's resource", async () => {
  const app = await start();
  const token = await tokenFor(app, "DNI", "11111111");
  const withQuery = await app.inject({
    method: "DELETE",
    url: "/api/v1/sessions/current?userId=id-2",
    headers: bearer(token),
  });
  expect(withQuery.statusCode).toBe(400);
  const withBody = await app.inject({
    method: "DELETE",
    url: "/api/v1/sessions/current",
    headers: { ...bearer(token), "content-type": "application/json" },
    payload: { userId: "id-2" },
  });
  expect(withBody.statusCode).toBe(400);
  const stillValid = await app.inject({
    method: "GET",
    url: "/api/v1/me",
    headers: bearer(token),
  });
  expect(stillValid.statusCode).toBe(200);
});
