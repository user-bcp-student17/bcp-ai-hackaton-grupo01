import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { NewSession, SessionRepository } from "../../application/ports.js";

const userIdRow = z.object({ user_id: z.string() });

export class SqliteSessions implements SessionRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(session: NewSession): void {
    this.database
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.userId,
        session.tokenHash,
        session.createdAt,
        session.expiresAt,
      );
  }

  findUserIdByTokenHash(tokenHash: string, nowIso: string): string | null {
    const row = this.database
      .prepare(
        "SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?",
      )
      .get(tokenHash, nowIso);
    return row ? userIdRow.parse(row).user_id : null;
  }

  revokeByTokenHash(tokenHash: string, nowIso: string): boolean {
    const result = this.database
      .prepare("DELETE FROM sessions WHERE token_hash = ? AND expires_at > ?")
      .run(tokenHash, nowIso);
    return Number(result.changes) > 0;
  }
}
