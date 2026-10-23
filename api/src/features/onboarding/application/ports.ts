import type {
  DocumentIdentity,
  KycStatus,
  User,
  Wallet,
} from "../domain/identity.js";

export interface KycVerifier {
  verify(
    identity: DocumentIdentity,
  ): Promise<{ kycStatus: KycStatus; simulated: true }>;
}
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, encodedHash: string): Promise<boolean>;
}
export interface UserRepository {
  create(user: User, passwordHash: string, openingBalanceCents: number): User;
  findById(id: string): User | null;
  findByDocument(
    identity: DocumentIdentity,
  ): { user: User; passwordHash: string } | null;
  findWalletByUserId(userId: string): Wallet | null;
  allocateOpening(
    walletId: string,
    amountCents: number,
    createdAt: string,
  ): void;
}
