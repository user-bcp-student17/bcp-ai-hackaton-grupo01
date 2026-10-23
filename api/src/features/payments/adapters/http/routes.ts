import { errorResponseSchema, type ErrorResponse } from "@wallet/contracts";
import type {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  PaymentError,
  type PaymentErrorCode,
  type PaymentPort,
} from "../../application/ports.js";
import {
  createPaymentResponseSchema,
  paymentHeadersSchema,
  paymentIdParamsSchema,
  paymentInputSchema,
  paymentKeyParamsSchema,
  paymentResponseSchema,
} from "./schemas.js";

export type PaymentRoutesOptions = {
  payments: PaymentPort;
  // Returns null for unknown, expired or revoked bearer tokens.
  resolveOwner: (token: string) => { id: string; active: boolean } | null;
};

type FailureMapping = { status: 400 | 404 | 409 | 503; message: string };

const failures: Record<PaymentErrorCode, FailureMapping> = {
  VALIDATION_ERROR: { status: 400, message: "Revisa los datos enviados." },
  RECIPIENT_NOT_FOUND: { status: 404, message: "Destinatario no encontrado." },
  PAYMENT_NOT_FOUND: { status: 404, message: "Pago no encontrado." },
  SELF_TRANSFER: {
    status: 409,
    message: "No puedes transferirte a tu propia cuenta.",
  },
  CONTACT_REQUIRED: {
    status: 409,
    message: "El destinatario debe estar en tus contactos.",
  },
  INSUFFICIENT_FUNDS: { status: 409, message: "Saldo insuficiente." },
  BALANCE_LIMIT_EXCEEDED: {
    status: 409,
    message: "El destinatario no puede recibir este monto.",
  },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    message: "La clave ya se usó con otro pago.",
  },
  STORAGE_UNAVAILABLE: {
    status: 503,
    message: "Almacenamiento no disponible.",
  },
};

const safeError = (code: string, message: string): ErrorResponse => ({
  error: { code, message },
});

// The scheme is the literal "Bearer", one space, then a base64url token.
const bearerPattern = /^Bearer ([A-Za-z0-9_-]+)$/;

declare module "fastify" {
  interface FastifyRequest {
    paymentOwnerId: string | null;
  }
}

// Only PaymentError is mapped. Anything else is a bug and reaches the global 500 handler.
function paymentFailure(reply: FastifyReply, error: unknown): ErrorResponse {
  if (!(error instanceof PaymentError)) throw error;
  const { status, message } = failures[error.code];
  reply.code(status);
  return safeError(error.code, message);
}

function ownerIdOf(request: FastifyRequest): string {
  // The guard runs in onRequest for every payment route, so this is never null here.
  if (request.paymentOwnerId === null) throw new Error("Owner guard was skipped");
  return request.paymentOwnerId;
}

export const paymentRoutes: FastifyPluginCallback<PaymentRoutesOptions> = (
  app,
  options,
  done,
) => {
  const server = app.withTypeProvider<ZodTypeProvider>();
  app.decorateRequest("paymentOwnerId", null);

  // Runs before schema validation, so unauthenticated callers never learn about input rules.
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = bearerPattern.exec(request.headers.authorization ?? "")?.[1];
    const owner = token === undefined ? null : options.resolveOwner(token);
    if (owner === null) {
      return reply
        .code(401)
        .send(safeError("UNAUTHENTICATED", "Sesión no válida."));
    }
    if (!owner.active) {
      return reply
        .code(403)
        .send(safeError("ACCOUNT_INACTIVE", "La cuenta no está activa."));
    }
    request.paymentOwnerId = owner.id;
  };

  const errorResponses = {
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
    503: errorResponseSchema,
  };

  server.post(
    "/api/v1/payments",
    {
      onRequest: guard,
      schema: {
        headers: paymentHeadersSchema,
        body: paymentInputSchema,
        response: {
          200: createPaymentResponseSchema,
          201: createPaymentResponseSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      try {
        const result = options.payments.transfer({
          sourceUserId: ownerIdOf(request),
          idempotencyKey: request.headers["idempotency-key"],
          recipientWalletId: request.body.recipientWalletId,
          amountCents: request.body.amountCents,
        });
        reply.code(result.outcome === "created" ? 201 : 200);
        return { payment: result.payment, wallet: result.wallet };
      } catch (error) {
        return paymentFailure(reply, error);
      }
    },
  );

  // Registered before /:id so "by-key" is never read as a payment ID.
  server.get(
    "/api/v1/payments/by-key/:key",
    {
      onRequest: guard,
      schema: {
        params: paymentKeyParamsSchema,
        response: { 200: paymentResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      try {
        const payment = options.payments.findByKey(
          ownerIdOf(request),
          request.params.key,
        );
        if (payment === null) throw new PaymentError("PAYMENT_NOT_FOUND");
        return { payment };
      } catch (error) {
        return paymentFailure(reply, error);
      }
    },
  );

  server.get(
    "/api/v1/payments/:id",
    {
      onRequest: guard,
      schema: {
        params: paymentIdParamsSchema,
        response: { 200: paymentResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      try {
        const payment = options.payments.findForParticipant(
          ownerIdOf(request),
          request.params.id,
        );
        if (payment === null) throw new PaymentError("PAYMENT_NOT_FOUND");
        return { payment };
      } catch (error) {
        return paymentFailure(reply, error);
      }
    },
  );
  done();
};
