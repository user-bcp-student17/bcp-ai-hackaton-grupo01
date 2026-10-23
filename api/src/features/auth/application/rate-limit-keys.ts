import { createHmac } from "node:crypto";
import type { DocumentIdentity } from "../../onboarding/domain/identity.js";

// Keyed with a per-process secret so the rate-limit store never holds raw document numbers.
export function documentBucketKey(
  identity: DocumentIdentity,
  secret: Buffer,
): string {
  const normalized = `${identity.documentType}:${identity.documentNumber.trim().toUpperCase()}`;
  const digest = createHmac("sha256", secret).update(normalized).digest("hex");
  return `login-document:${digest}`;
}
