import { z } from "zod";

export const documentTypeSchema = z.enum(["DNI", "CE"]);
export const kycStatusSchema = z.enum(["activa", "pendiente", "rechazada"]);
export const passwordSchema = z
  .string()
  .length(6)
  .regex(/^[0-9]{6}$/);
const documentFields = {
  documentType: documentTypeSchema,
  documentNumber: z.string().trim().toUpperCase(),
};
const validDocument = (value: {
  documentType: string;
  documentNumber: string;
}) =>
  (value.documentType === "DNI" ? /^[0-9]{8}$/ : /^[A-Z0-9]{9,12}$/).test(
    value.documentNumber,
  );
const documentError = {
  path: ["documentNumber"],
  message: "Documento inválido",
};

export const verificationInputSchema = z
  .strictObject(documentFields)
  .refine(validDocument, documentError);
export const registrationInputSchema = z
  .strictObject({
    ...documentFields,
    phone: z
      .string()
      .trim()
      .regex(/^(?:\+51)?9[0-9]{8}$/)
      .transform((value) => (value.startsWith("+51") ? value : `+51${value}`)),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    password: passwordSchema,
  })
  .refine(validDocument, documentError);

const idSchema = z.string().min(1).max(100);
export const userViewSchema = z.strictObject({
  id: idSchema,
  documentType: documentTypeSchema,
  documentNumber: z.string(),
  phone: z.string(),
  email: z.string(),
  walletId: idSchema.nullable(),
  kycStatus: kycStatusSchema,
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const walletViewSchema = z.strictObject({
  id: idSchema,
  currency: z.literal("PEN"),
  balanceCents: z.number().int().min(0).max(100_000_000),
});
export const verificationResponseSchema = z.strictObject({
  kycStatus: kycStatusSchema,
  simulated: z.literal(true),
});
export const registrationResponseSchema = z.strictObject({
  user: userViewSchema,
});

export type RegistrationInput = z.infer<typeof registrationInputSchema>;
export type VerificationInput = z.infer<typeof verificationInputSchema>;
export type UserView = z.infer<typeof userViewSchema>;
export type WalletView = z.infer<typeof walletViewSchema>;
