import { createHash } from "node:crypto";

export class InvalidCredentials extends Error {
  readonly code = "INVALID_CREDENTIALS";
  constructor() {
    super("Documento o contraseña incorrectos.");
  }
}

export class Unauthenticated extends Error {
  readonly code = "UNAUTHENTICATED";
  constructor() {
    super("Sesión no válida.");
  }
}

// Only the hash is stored: a leaked database must not contain usable bearer tokens.
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
