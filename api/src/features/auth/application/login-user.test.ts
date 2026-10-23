import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { registrationInputSchema } from "@wallet/contracts/onboarding";
import { migrationsDirectory, openDatabase } from "../../../shared/database.js";
import { ScryptPasswords } from "../../onboarding/adapters/persistence/scrypt-passwords.js";
import { SqliteUsers } from "../../onboarding/adapters/persistence/sqlite-users.js";
import { registerUser } from "../../onboarding/application/register-user.js";
import type { KycStatus } from "../../onboarding/domain/identity.js";
import { SqliteSessions } from "../adapters/persistence/sqlite-sessions.js";
import { InvalidCredentials, hashSessionToken } from "../domain/session.js";
import type { PasswordVerifier } from "./ports.js";
import { loginUser } from "./login-user.js";

const registrationTime = "2026-10-23T16:00:00.000Z";
const registration = registrationInputSchema.parse({
  documentType: "DNI",
  documentNumber: "01234567",
  phone: "912345678",
  email: "login@example.test",
  password: "012345",
});
const passwords = new ScryptPasswords();
let directory: string;
let database: ReturnType<typeof openDatabase>;
let users: SqliteUsers;
let sessions: SqliteSessions;
let clock: Date;
let counter: number;
let dummyPasswordHash: string;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "auth-login-"));
  database = openDatabase(
    join(directory, "wallet.sqlite"),
    migrationsDirectory,
  );
  users = new SqliteUsers(database);
  sessions = new SqliteSessions(database);
  clock = new Date(registrationTime);
  counter = 0;
  dummyPasswordHash = await passwords.hash("unused-dummy-secret");
});
afterEach(() => {
  database.close();
  rmSync(directory, { recursive: true });
});

async function register(kycStatus: KycStatus = "activa") {
  return registerUser({
    users,
    passwords,
    kyc: { verify: () => Promise.resolve({ kycStatus, simulated: true }) },
    now: () => registrationTime,
    newId: () => `id-${String(++counter)}`,
    openingBalanceCents: 100_000,
  })(registration);
}

function login(passwordVerifier: PasswordVerifier = passwords) {
  return loginUser({
    users,
    passwords: passwordVerifier,
    sessions,
    dummyPasswordHash,
    now: () => clock,
    newId: () => `session-${String(++counter)}`,
    newToken: () => `opaque-token-${String(++counter)}`,
    sessionTtlSeconds: 3600,
  });
}

const credentials = {
  documentType: "DNI" as const,
  documentNumber: "01234567",
  password: "012345",
};

function sessionRows() {
  return database.prepare("SELECT * FROM sessions").all();
}

test("Correct document login returns an opaque one-hour bearer session", async () => {
  const user = await register();
  const result = await login()(credentials);
  expect(result).toMatchObject({
    tokenType: "Bearer",
    expiresAt: "2026-10-23T17:00:00.000Z",
    user,
  });
  expect(result.accessToken).toMatch(/^opaque-token-\d+$/);
});

test("Stored session keeps only the SHA-256 hash of the bearer token", async () => {
  await register();
  const result = await login()(credentials);
  const rows = sessionRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    token_hash: hashSessionToken(result.accessToken),
    expires_at: "2026-10-23T17:00:00.000Z",
  });
  expect(JSON.stringify(rows)).not.toContain(result.accessToken);
});

test("Leading-zero password logs in and wrong password fails", async () => {
  await register();
  await expect(login()(credentials)).resolves.toMatchObject({
    tokenType: "Bearer",
  });
  await expect(
    login()({ ...credentials, password: "012346" }),
  ).rejects.toBeInstanceOf(InvalidCredentials);
});

test("Invalid credentials are indistinguishable and create no session", async () => {
  await register();
  const wrongPassword = await login()({
    ...credentials,
    password: "999999",
  }).catch((error: unknown) => error);
  const unknownDocument = await login()({
    ...credentials,
    documentNumber: "07654321",
  }).catch((error: unknown) => error);
  expect(wrongPassword).toBeInstanceOf(InvalidCredentials);
  expect(unknownDocument).toBeInstanceOf(InvalidCredentials);
  expect(wrongPassword).toMatchObject({
    code: "INVALID_CREDENTIALS",
    message: (unknownDocument as InvalidCredentials).message,
  });
  expect(sessionRows()).toHaveLength(0);
});

test("Unknown document still runs one scrypt verification against the dummy hash", async () => {
  await register();
  const verify = vi.fn((password: string, hash: string) =>
    passwords.verify(password, hash),
  );
  const recorder = { verify };
  await expect(
    login(recorder)({ ...credentials, documentNumber: "07654321" }),
  ).rejects.toBeInstanceOf(InvalidCredentials);
  expect(verify).toHaveBeenCalledTimes(1);
  expect(verify).toHaveBeenCalledWith(credentials.password, dummyPasswordHash);
});

test("Wrong password verifies against the stored hash, not the dummy", async () => {
  await register();
  const verify = vi.fn((password: string, hash: string) =>
    passwords.verify(password, hash),
  );
  await expect(
    login({ verify })({ ...credentials, password: "999999" }),
  ).rejects.toBeInstanceOf(InvalidCredentials);
  expect(verify).toHaveBeenCalledTimes(1);
  const [, hashChecked] = verify.mock.calls[0] ?? [];
  expect(hashChecked).not.toBe(dummyPasswordHash);
});

test.each(["pendiente", "rechazada"] as const)(
  "Login for %s user returns own status without a wallet",
  async (status) => {
    const user = await register(status);
    const result = await login()(credentials);
    expect(result.user).toEqual(user);
    expect(result.user).toMatchObject({ kycStatus: status, walletId: null });
    expect(users.findWalletByUserId(user.id)).toBeNull();
  },
);

test("Login does not create a second wallet or repeat the opening allocation", async () => {
  const user = await register();
  const walletBefore = users.findWalletByUserId(user.id);
  await login()(credentials);
  await login()(credentials);
  expect(users.findWalletByUserId(user.id)).toEqual(walletBefore);
  expect(
    database.prepare("SELECT count(*) AS count FROM wallet_openings").get()
      ?.count,
  ).toBe(1);
  expect(
    database.prepare("SELECT count(*) AS count FROM wallets").get()?.count,
  ).toBe(1);
});
