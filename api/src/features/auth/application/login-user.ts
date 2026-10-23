import type {
  DocumentIdentity,
  User,
} from "../../onboarding/domain/identity.js";
import { InvalidCredentials, hashSessionToken } from "../domain/session.js";
import type {
  PasswordVerifier,
  SessionRepository,
  UserLookup,
} from "./ports.js";

type Dependencies = {
  users: UserLookup;
  passwords: PasswordVerifier;
  sessions: SessionRepository;
  // Verified against unknown documents so both failures take the same time.
  dummyPasswordHash: string;
  now: () => Date;
  newId: () => string;
  newToken: () => string;
  sessionTtlSeconds: number;
};
export type LoginInput = DocumentIdentity & { password: string };
export type LoginResult = {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
  user: User;
};

export function loginUser(
  deps: Dependencies,
): (input: LoginInput) => Promise<LoginResult> {
  return async (input) => {
    const credentials = deps.users.findByDocument({
      documentType: input.documentType,
      documentNumber: input.documentNumber,
    });
    if (!credentials) {
      await deps.passwords.verify(input.password, deps.dummyPasswordHash);
      throw new InvalidCredentials();
    }
    const matches = await deps.passwords.verify(
      input.password,
      credentials.passwordHash,
    );
    if (!matches) throw new InvalidCredentials();

    const createdAt = deps.now();
    const expiresAt = new Date(
      createdAt.getTime() + deps.sessionTtlSeconds * 1000,
    );
    const accessToken = deps.newToken();
    deps.sessions.create({
      id: deps.newId(),
      userId: credentials.user.id,
      tokenHash: hashSessionToken(accessToken),
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    return {
      accessToken,
      tokenType: "Bearer",
      expiresAt: expiresAt.toISOString(),
      user: credentials.user,
    };
  };
}
