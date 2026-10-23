import type { User } from "../../onboarding/domain/identity.js";
import { Unauthenticated, hashSessionToken } from "../domain/session.js";
import type { SessionRepository, UserLookup } from "./ports.js";

type Dependencies = {
  users: UserLookup;
  sessions: SessionRepository;
  now: () => Date;
};

// Expired, revoked, unknown and malformed tokens all end here, with the same error.
export function resolveSession(deps: Dependencies): (token: string) => User {
  return (token) => {
    const userId = deps.sessions.findUserIdByTokenHash(
      hashSessionToken(token),
      deps.now().toISOString(),
    );
    if (userId === null) throw new Unauthenticated();
    const user = deps.users.findById(userId);
    if (user === null) throw new Unauthenticated();
    return user;
  };
}
