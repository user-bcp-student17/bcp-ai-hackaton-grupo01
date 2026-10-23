import { Unauthenticated, hashSessionToken } from "../domain/session.js";
import type { SessionRepository } from "./ports.js";

type Dependencies = {
  sessions: SessionRepository;
  now: () => Date;
};

export function revokeSession(deps: Dependencies): (token: string) => void {
  return (token) => {
    const revoked = deps.sessions.revokeByTokenHash(
      hashSessionToken(token),
      deps.now().toISOString(),
    );
    if (!revoked) throw new Unauthenticated();
  };
}
