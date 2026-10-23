import { expect, test } from "vitest";
import {
  registrationInputSchema,
  verificationInputSchema,
} from "./onboarding.js";

const input = {
  documentType: "DNI",
  documentNumber: " 12345678 ",
  phone: " 912345678 ",
  email: " DEMO@EXAMPLE.TEST ",
  password: "012345",
};

test("Register DNI normalizes phone/email without coercing a leading-zero password", () => {
  expect(registrationInputSchema.parse(input)).toEqual({
    ...input,
    documentNumber: "12345678",
    phone: "+51912345678",
    email: "demo@example.test",
  });
});
test("Register CE and leading-zero password", () => {
  expect(
    registrationInputSchema.parse({
      ...input,
      documentType: "CE",
      documentNumber: " abc123456 ",
      phone: "+51912345678",
    }).documentNumber,
  ).toBe("ABC123456");
});
test.each(["ABC123456", "ABC123456789"])(
  "CE accepts demo length boundaries: %s",
  (documentNumber) => {
    expect(
      verificationInputSchema.parse({ documentType: "CE", documentNumber }),
    ).toEqual({ documentType: "CE", documentNumber });
  },
);
test.each(["documentType", "documentNumber", "phone", "email", "password"])(
  "Invalid registration rejects missing %s",
  (field) => {
    expect(
      registrationInputSchema.safeParse({ ...input, [field]: undefined })
        .success,
    ).toBe(false);
  },
);
test.each([
  { documentNumber: "1234567" },
  { documentNumber: "123456789" },
  { documentType: "CE", documentNumber: "ABC12345" },
  { documentType: "CE", documentNumber: "ABC1234567890" },
  { documentType: "CE", documentNumber: "ABC-123456" },
  { phone: "812345678" },
  { phone: "+51 912345678" },
  { phone: "912-345-678" },
  { email: "invalid" },
  { email: `${"a".repeat(250)}@x.test` },
  { password: 123456 },
  { password: "12345" },
  { password: "1234567" },
  { password: " 012345" },
  { password: "012345\n" },
  { password: "abcdef" },
  { email: undefined },
  { kycStatus: "activa" },
  { balanceCents: 100 },
  { walletId: "supplied" },
])(
  "Invalid registration rejects malformed or untrusted input: %j",
  (override) => {
    expect(
      registrationInputSchema.safeParse({ ...input, ...override }).success,
    ).toBe(false);
  },
);
test("Client cannot select approval", () => {
  expect(
    verificationInputSchema.safeParse({
      documentType: "DNI",
      documentNumber: "12345678",
      kycStatus: "activa",
    }).success,
  ).toBe(false);
});
