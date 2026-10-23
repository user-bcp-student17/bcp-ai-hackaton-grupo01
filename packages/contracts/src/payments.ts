import { z } from "zod";
import { walletViewSchema } from "./onboarding.js";

const MAX_STORAGE_CENTS = 100_000_000;
const MAX_KEY_LENGTH = 100;

export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(MAX_KEY_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/);

const opaqueIdSchema = z.string().min(1).max(MAX_KEY_LENGTH);

export const paymentHeadersSchema = z.object({
  "idempotency-key": idempotencyKeySchema,
});
export const paymentKeyParamsSchema = z.strictObject({
  key: idempotencyKeySchema,
});
export const paymentIdParamsSchema = z.strictObject({
  id: opaqueIdSchema,
});

export const paymentInputSchema = z.strictObject({
  recipientType: z.literal("contact"),
  recipientWalletId: opaqueIdSchema,
  amountCents: z.number().int().min(1).max(MAX_STORAGE_CENTS),
  currency: z.literal("PEN"),
});

export const paymentViewSchema = z.strictObject({
  id: opaqueIdSchema,
  sourceWalletId: opaqueIdSchema,
  destinationWalletId: opaqueIdSchema,
  recipientType: z.literal("contact"),
  amountCents: z.number().int().min(1).max(MAX_STORAGE_CENTS),
  currency: z.literal("PEN"),
  status: z.literal("SUCCEEDED"),
  createdAt: z.iso.datetime(),
});

export const paymentResponseSchema = z.strictObject({
  payment: paymentViewSchema,
});
export const createPaymentResponseSchema = z.strictObject({
  payment: paymentViewSchema,
  wallet: walletViewSchema,
});

export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type PaymentView = z.infer<typeof paymentViewSchema>;
export type CreatePaymentResponse = z.infer<typeof createPaymentResponseSchema>;
