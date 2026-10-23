import { expect, test } from "vitest";
import type { DocumentIdentity } from "../../onboarding/domain/identity.js";
import { documentBucketKey } from "./rate-limit-keys.js";

const secret = Buffer.from("a".repeat(64), "hex");
const otherSecret = Buffer.from("b".repeat(64), "hex");
const identity: DocumentIdentity = {
  documentType: "CE",
  documentNumber: "ABC123456",
};

test("Same normalized document shares one rate-limit bucket", () => {
  expect(
    documentBucketKey({ ...identity, documentNumber: " abc123456 " }, secret),
  ).toBe(documentBucketKey(identity, secret));
});

test("Different document type or number uses a different bucket", () => {
  expect(
    documentBucketKey(
      { documentType: "DNI", documentNumber: "ABC123456" },
      secret,
    ),
  ).not.toBe(documentBucketKey(identity, secret));
  expect(
    documentBucketKey({ ...identity, documentNumber: "ABC123457" }, secret),
  ).not.toBe(documentBucketKey(identity, secret));
});

test("Bucket key never contains the raw document number", () => {
  expect(documentBucketKey(identity, secret)).not.toContain("ABC123456");
});

test("Bucket key depends on the per-process secret", () => {
  expect(documentBucketKey(identity, otherSecret)).not.toBe(
    documentBucketKey(identity, secret),
  );
});
