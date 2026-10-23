import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  registrationInputSchema,
  userViewSchema,
  walletViewSchema,
} from "@wallet/contracts/onboarding";
import { migrationsDirectory, openDatabase } from "../../../shared/database.js";
import { ScryptPasswords } from "../adapters/persistence/scrypt-passwords.js";
import { SqliteUsers } from "../adapters/persistence/sqlite-users.js";
import { UserAlreadyExists, type KycStatus } from "../domain/identity.js";
import { registerUser } from "./register-user.js";

const timestamp = "2026-10-23T16:00:00.000Z";
const input = registrationInputSchema.parse({
  documentType: "CE",
  documentNumber: " abc123456 ",
  phone: "912345678",
  email: " DEMO@EXAMPLE.TEST ",
  password: "012345",
});
let directory: string;
let database: ReturnType<typeof openDatabase>;
let users: SqliteUsers;
const passwords = new ScryptPasswords();
let nextId: number;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "onboarding-"));
  database = openDatabase(
    join(directory, "wallet.sqlite"),
    migrationsDirectory,
  );
  users = new SqliteUsers(database);
  nextId = 0;
});
afterEach(() => {
  database.close();
  rmSync(directory, { recursive: true });
});
function registration(status: KycStatus = "activa") {
  return registerUser({
    users,
    passwords,
    kyc: {
      verify: () => Promise.resolve({ kycStatus: status, simulated: true }),
    },
    now: () => timestamp,
    newId: () => `id-${String(++nextId)}`,
    openingBalanceCents: 100_000,
  });
}
function counts() {
  return ["users", "wallets", "wallet_openings"].map((table) => {
    // Table names are fixed internal constants, never request input.
    return database.prepare(`SELECT count(*) AS count FROM ${table}`).get()
      ?.count;
  });
}

test("Active affiliation persists exactly one PEN wallet and opening allocation", async () => {
  const user = await registration()(input);
  expect(userViewSchema.parse(user)).toEqual({
    id: "id-1",
    documentType: "CE",
    documentNumber: "ABC123456",
    phone: "+51912345678",
    email: "demo@example.test",
    walletId: "id-2",
    kycStatus: "activa",
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  expect(walletViewSchema.parse(users.findWalletByUserId(user.id))).toEqual({
    id: "id-2",
    currency: "PEN",
    balanceCents: 100_000,
  });
  expect(counts()).toEqual([1, 1, 1]);
  expect(users.findById(user.id)).toEqual(user);
  expect(users.findById("missing")).toBeNull();
  expect(
    users.findByDocument({ documentType: "DNI", documentNumber: "00000000" }),
  ).toBeNull();
  expect(users.findWalletByUserId("missing")).toBeNull();
});
test.each(["pendiente", "rechazada"] as const)(
  "Inactive affiliation: %s has no wallet",
  async (status) => {
    const user = await registration(status)(input);
    expect(user).toMatchObject({
      kycStatus: status,
      active: false,
      walletId: null,
    });
    expect(users.findWalletByUserId(user.id)).toBeNull();
    expect(counts()).toEqual([1, 0, 0]);
    database.close();
    database = openDatabase(
      join(directory, "wallet.sqlite"),
      migrationsDirectory,
    );
    users = new SqliteUsers(database);
    expect(users.findById(user.id)).toEqual(user);
    expect(counts()).toEqual([1, 0, 0]);
  },
);
test.each([
  {
    documentNumber: input.documentNumber,
    phone: "+51987654321",
    email: "other@example.test",
  },
  {
    documentNumber: "CE987654321",
    phone: input.phone,
    email: "other@example.test",
  },
  { documentNumber: "CE987654321", phone: "+51987654321", email: input.email },
])("Duplicate normalized identity is atomic: %j", async (override) => {
  await registration()(input);
  await expect(
    registration()({ ...input, ...override }),
  ).rejects.toBeInstanceOf(UserAlreadyExists);
  expect(counts()).toEqual([1, 1, 1]);
});
test("Technical persistence failure rolls back user, wallet and opening", async () => {
  database.exec(`CREATE TRIGGER fail_affiliation BEFORE UPDATE OF wallet_id ON users
    BEGIN SELECT RAISE(ABORT, 'controlled failure'); END`);
  await expect(registration()(input)).rejects.toThrow("controlled failure");
  expect(counts()).toEqual([0, 0, 0]);
});
test("Technical verification failure persists no partial account", async () => {
  const register = registerUser({
    users,
    passwords,
    kyc: { verify: () => Promise.reject(new Error("controlled KYC failure")) },
    now: () => timestamp,
    newId: () => "unused",
    openingBalanceCents: 100_000,
  });
  await expect(register(input)).rejects.toThrow("controlled KYC failure");
  expect(counts()).toEqual([0, 0, 0]);
});
test("Opening allocation is not repeated after balance change or restart", async () => {
  const user = await registration()(input);
  database
    .prepare("UPDATE wallets SET balance_cents = ? WHERE user_id = ?")
    .run(1234, user.id);
  database.close();
  database = openDatabase(
    join(directory, "wallet.sqlite"),
    migrationsDirectory,
  );
  users = new SqliteUsers(database);
  users.allocateOpening("id-2", 100_000, timestamp);
  users.allocateOpening("id-2", 999_999, timestamp);
  expect(users.findById(user.id)).toEqual(user);
  expect(users.findWalletByUserId(user.id)?.balanceCents).toBe(1234);
  expect(counts()).toEqual([1, 1, 1]);
});
test("Registration response excludes secrets; salted scrypt preserves leading zeros", async () => {
  const user = await registration()(input);
  const credentials = users.findByDocument(input);
  expect(credentials).not.toBeNull();
  if (!credentials) throw new Error("Expected stored credentials");
  expect(Object.keys(user)).not.toContain("passwordHash");
  expect(JSON.stringify(user)).not.toContain(input.password);
  const hash = credentials.passwordHash;
  expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  expect(await passwords.verify("012345", hash)).toBe(true);
  expect(await passwords.verify("12345", hash)).toBe(false);
  expect(await passwords.verify("012345", "malformed")).toBe(false);
  expect(await passwords.hash("012345")).not.toBe(hash);
  expect(
    database
      .prepare("PRAGMA table_info(users)")
      .all()
      .map((row) => row.name),
  ).not.toContain("password");
});
test("Invalid opening amount rolls back registration", async () => {
  const register = registerUser({
    users,
    passwords,
    kyc: {
      verify: () => Promise.resolve({ kycStatus: "activa", simulated: true }),
    },
    now: () => timestamp,
    newId: () => `invalid-${String(++nextId)}`,
    openingBalanceCents: -1,
  });
  await expect(register(input)).rejects.toThrow();
  expect(counts()).toEqual([0, 0, 0]);
});
