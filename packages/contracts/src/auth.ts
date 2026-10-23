import { z } from "zod";
import {
  documentTypeSchema,
  passwordSchema,
  userViewSchema,
} from "./onboarding.js";

const validDocument = (value: {
  documentType: string;
  documentNumber: string;
}) =>
  (value.documentType === "DNI" ? /^[0-9]{8}$/ : /^[A-Z0-9]{9,12}$/).test(
    value.documentNumber,
  );

export const loginInputSchema = z
  .strictObject({
    documentType: documentTypeSchema,
    documentNumber: z.string().trim().toUpperCase(),
    password: passwordSchema,
  })
  .refine(validDocument, {
    path: ["documentNumber"],
    message: "Documento inválido",
  });
export const sessionResponseSchema = z.strictObject({
  accessToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresAt: z.iso.datetime(),
  user: userViewSchema,
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
