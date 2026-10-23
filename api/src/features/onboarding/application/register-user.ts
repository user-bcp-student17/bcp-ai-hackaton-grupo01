import type { DocumentIdentity, User } from "../domain/identity.js";
import type { KycVerifier, PasswordHasher, UserRepository } from "./ports.js";

type Registration = DocumentIdentity & {
  phone: string;
  email: string;
  password: string;
};
type Dependencies = {
  users: UserRepository;
  passwords: PasswordHasher;
  kyc: KycVerifier;
  now: () => string;
  newId: () => string;
  openingBalanceCents: number;
};

export function registerUser(
  deps: Dependencies,
): (input: Registration) => Promise<User> {
  return async (input) => {
    const { kycStatus } = await deps.kyc.verify({
      documentType: input.documentType,
      documentNumber: input.documentNumber,
    });
    const passwordHash = await deps.passwords.hash(input.password);
    const timestamp = deps.now();
    const active = kycStatus === "activa";
    const user: User = {
      id: deps.newId(),
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      phone: input.phone,
      email: input.email,
      walletId: active ? deps.newId() : null,
      kycStatus,
      active,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return deps.users.create(user, passwordHash, deps.openingBalanceCents);
  };
}
