import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { registrationInputSchema } from "@wallet/contracts/onboarding";
import { migrationsDirectory, openDatabase } from "../../../shared/database.js";
import { ScryptPasswords } from "../../onboarding/adapters/persistence/scrypt-passwords.js";
import { SqliteUsers } from "../../onboarding/adapters/persistence/sqlite-users.js";
import { registerUser } from "../../onboarding/application/register-user.js";
import { SqliteSessions } from "../adapters/persistence/sqlite-sessions.js";
import { Unauthenticated } from "../domain/session.js";
import { loginUser } from "./login-user.js";
import { resolveSession } from "./resolve-session.js";
import { revokeSession } from "./revoke-session.js";

const loginTime = "2026-10-23T16:00:00.000Z";
const SESSION_TTL_SECONDS = 3600;
const passwords = new ScryptPasswords();
const credentials = {
  documentType: "CE" as const,
  documentNumber: "ABC123456",
  password: "012345",
};
let directory: string;
let database: ReturnType<typeof openDatabase>;
let users: SqliteUsers;
let sessions: SqliteSessions;
let clock: Date;
let counter: number;
let dummyPasswordHash: string;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "auth-session-"));
  database = openDatabase(
    join(directory, "wallet.sqlite"),
    migrationsDirectory,
  );
  users = new SqliteUsers(database);
  sessions = new SqliteSessions(database);
  clock = new Date(loginTime);
  counter = 0;
  dummyPasswordHash = await passwords.hash("unused-dummy-secret");
  await registerUser({
    users,
    passwords,
    kyc: {
      verify: () => Promise.resolve({ kycStatus: "activa", simulated: true }),
    },
    now: () => loginTime,
    newId: () => `id-${String(++counter)}`,
    openingBalanceCents: 100_000,
  })(
    registrationInputSchema.parse({
      documentType: "CE",
      documentNumber: "ABC123456",
      phone: "912345678",
      email: "session@example.test",
      password: "012345",
    }),
  );
});
afterEach(() => {
  database.close();
  rmSync(directory, { recursive: true });
});

function login() {
  return loginUser({
    users,
    passwords,
    sessions,
    dummyPasswordHash,
    now: () => clock,
    newId: () => `session-${String(++counter)}`,
    newToken: () => `opaque-token-${String(++counter)}`,
    sessionTtlSeconds: SESSION_TTL_SECONDS,
  });
}
function resolve(token: string) {
  return resolveSession({ users, sessions, now: () => clock })(token);
}
function revoke(token: string) {
  revokeSession({ sessions, now: () => clock })(token);
}
function secondsLater(seconds: number): Date {
  return new Date(new Date(loginTime).getTime() + seconds * 1000);
}
function reopen() {
  database.close();
  database = openDatabase(
    join(directory, "wallet.sqlite"),
    migrationsDirectory,
  );
  users = new SqliteUsers(database);
  sessions = new SqliteSessions(database);
}

test("Valid session resolves to its owner until exactly one hour has passed", async () => {
  const { accessToken, user } = await login()(credentials);
  clock = secondsLater(SESSION_TTL_SECONDS - 1);
  expect(resolve(accessToken)).toEqual(user);
  clock = secondsLater(SESSION_TTL_SECONDS);
  expect(() => resolve(accessToken)).toThrow(Unauthenticated);
});

test("Expired session stays unauthenticated even though its row is not purged", async () => {
  const { accessToken } = await login()(credentials);
  clock = secondsLater(SESSION_TTL_SECONDS + 60);
  expect(() => resolve(accessToken)).toThrow(Unauthenticated);
  expect(
    database.prepare("SELECT count(*) AS count FROM sessions").get()?.count,
  ).toBe(1);
});

test("Logout revokes the session once; reuse and second logout are rejected", async () => {
  const { accessToken } = await login()(credentials);
  revoke(accessToken);
  expect(() => resolve(accessToken)).toThrow(Unauthenticated);
  expect(() => {
    revoke(accessToken);
  }).toThrow(Unauthenticated);
});

test("Revoking an already expired session is rejected", async () => {
  const { accessToken } = await login()(credentials);
  clock = secondsLater(SESSION_TTL_SECONDS);
  expect(() => {
    revoke(accessToken);
  }).toThrow(Unauthenticated);
});

test("Unknown and malformed bearer values are rejected", async () => {
  await login()(credentials);
  expect(() => resolve("")).toThrow(Unauthenticated);
  expect(() => resolve("not-a-session-token")).toThrow(Unauthenticated);
});

test("Revoking one session leaves the user's other sessions valid", async () => {
  const first = await login()(credentials);
  const second = await login()(credentials);
  revoke(first.accessToken);
  expect(() => resolve(first.accessToken)).toThrow(Unauthenticated);
  expect(resolve(second.accessToken)).toEqual(second.user);
});

test("Real SQLite session survives restart until expiry", async () => {
  const { accessToken, user } = await login()(credentials);
  reopen();
  expect(resolve(accessToken)).toEqual(user);
  clock = secondsLater(SESSION_TTL_SECONDS);
  expect(() => resolve(accessToken)).toThrow(Unauthenticated);
});

test("Revocation persists across restart", async () => {
  const { accessToken } = await login()(credentials);
  revoke(accessToken);
  reopen();
  expect(() => resolve(accessToken)).toThrow(Unauthenticated);
});
