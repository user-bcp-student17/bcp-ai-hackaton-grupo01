import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { inTransaction } from "../../../../shared/database.js";
import type { UserRepository } from "../../application/ports.js";
import {
  UserAlreadyExists,
  type DocumentIdentity,
  type User,
  type Wallet,
} from "../../domain/identity.js";

const userRow = z.object({
  id: z.string(),
  document_type: z.enum(["DNI", "CE"]),
  document_number: z.string(),
  phone: z.string(),
  email: z.string(),
  wallet_id: z.string().nullable(),
  kyc_status: z.enum(["activa", "pendiente", "rechazada"]),
  active: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  password_hash: z.string(),
});
function mapUser(row: z.infer<typeof userRow>): User {
  return {
    id: row.id,
    documentType: row.document_type,
    documentNumber: row.document_number,
    phone: row.phone,
    email: row.email,
    walletId: row.wallet_id,
    kycStatus: row.kyc_status,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteUsers implements UserRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(user: User, passwordHash: string, openingBalanceCents: number): User {
    try {
      inTransaction(this.database, () => {
        this.database
          .prepare(
            `INSERT INTO users
          (id, document_type, document_number, phone, email, password_hash, wallet_id,
           kyc_status, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
          )
          .run(
            user.id,
            user.documentType,
            user.documentNumber,
            user.phone,
            user.email,
            passwordHash,
            user.kycStatus,
            Number(user.active),
            user.createdAt,
            user.updatedAt,
          );
        if (user.active && user.walletId) {
          this.database
            .prepare(`INSERT INTO wallets VALUES (?, ?, 'PEN', 0, ?, ?)`)
            .run(user.walletId, user.id, user.createdAt, user.updatedAt);
          this.allocateOpeningWithinTransaction(
            user.walletId,
            openingBalanceCents,
            user.createdAt,
          );
          this.database
            .prepare("UPDATE users SET wallet_id = ? WHERE id = ?")
            .run(user.walletId, user.id);
        }
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "errcode" in error &&
        error.errcode === 2067
      ) {
        throw new UserAlreadyExists();
      }
      throw error;
    }
    return user;
  }

  findById(id: string): User | null {
    const row = this.database
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(id);
    return row ? mapUser(userRow.parse(row)) : null;
  }

  findByDocument(
    identity: DocumentIdentity,
  ): { user: User; passwordHash: string } | null {
    const row = this.database
      .prepare(
        "SELECT * FROM users WHERE document_type = ? AND document_number = ?",
      )
      .get(identity.documentType, identity.documentNumber);
    if (!row) return null;
    const parsed = userRow.parse(row);
    return { user: mapUser(parsed), passwordHash: parsed.password_hash };
  }

  findWalletByUserId(userId: string): Wallet | null {
    const row = this.database
      .prepare(
        `SELECT id, currency, balance_cents AS balanceCents
      FROM wallets WHERE user_id = ?`,
      )
      .get(userId);
    return row
      ? z
          .object({
            id: z.string(),
            currency: z.literal("PEN"),
            balanceCents: z.number().int(),
          })
          .parse(row)
      : null;
  }

  allocateOpening(
    walletId: string,
    amountCents: number,
    createdAt: string,
  ): void {
    inTransaction(this.database, () => {
      this.allocateOpeningWithinTransaction(walletId, amountCents, createdAt);
    });
  }

  private allocateOpeningWithinTransaction(
    walletId: string,
    amountCents: number,
    createdAt: string,
  ): void {
    const result = this.database
      .prepare(
        `INSERT INTO wallet_openings (wallet_id, amount_cents, created_at)
      VALUES (?, ?, ?) ON CONFLICT(wallet_id) DO NOTHING`,
      )
      .run(walletId, amountCents, createdAt);
    if (result.changes === 0) return;
    this.database
      .prepare(
        "UPDATE wallets SET balance_cents = balance_cents + ?, updated_at = ? WHERE id = ?",
      )
      .run(amountCents, createdAt, walletId);
  }
}
