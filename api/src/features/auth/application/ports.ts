import type {
  DocumentIdentity,
  User,
  Wallet,
} from "../../onboarding/domain/identity.js";

export interface UserLookup {
  findByDocument(
    identity: DocumentIdentity,
  ): { user: User; passwordHash: string } | null;
  findById(id: string): User | null;
  findWalletByUserId(userId: string): Wallet | null;
}
export interface PasswordVerifier {
  verify(password: string, encodedHash: string): Promise<boolean>;
}
export type NewSession = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
};
export interface SessionRepository {
  create(session: NewSession): void;
  findUserIdByTokenHash(tokenHash: string, nowIso: string): string | null;
  revokeByTokenHash(tokenHash: string, nowIso: string): boolean;
}
