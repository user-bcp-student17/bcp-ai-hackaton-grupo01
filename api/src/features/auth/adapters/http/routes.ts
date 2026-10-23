import type { FastifyPluginCallback, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  emptyInputSchema,
  errorResponseSchema,
  type ErrorResponse,
} from "@wallet/contracts";
import {
  accountResponseSchema,
  loginInputSchema,
  sessionResponseSchema,
} from "@wallet/contracts/auth";
import type {
  User,
  Wallet,
} from "../../../onboarding/domain/identity.js";
import type { LoginThrottle } from "../../application/login-throttle.js";
import { documentBucketKey } from "../../application/rate-limit-keys.js";
import {
  InvalidCredentials,
  Unauthenticated,
} from "../../domain/session.js";

export type AuthRoutesDeps = {
  login: (input: {
    documentType: "DNI" | "CE";
    documentNumber: string;
    password: string;
  }) => Promise<{
    accessToken: string;
    tokenType: "Bearer";
    expiresAt: string;
    user: User;
  }>;
  revoke: (token: string) => void;
  resolve: (token: string) => User;
  account: (owner: User) => { user: User; wallet: Wallet | null };
  throttle: LoginThrottle;
  documentSecret: Buffer;
};

declare module "fastify" {
  interface FastifyRequest {
    owner: User | null;
    bearerToken: string | null;
  }
}

const safeError = (code: string, message: string): ErrorResponse => ({
  error: { code, message },
});

// The scheme is the literal "Bearer", one space, then a base64url token.
const bearerPattern = /^Bearer ([A-Za-z0-9_-]+)$/;

export const authRoutes: FastifyPluginCallback<AuthRoutesDeps> = (
  app,
  deps,
  done,
) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();


  app.decorateRequest("owner", null);
  app.decorateRequest("bearerToken", null);

  // Owner identity comes only from the session: no user id is read from input.
  const authenticate = (request: FastifyRequest): boolean => {
    const match = bearerPattern.exec(request.headers.authorization ?? "");
    if (!match?.[1]) return false;
    try {
      request.owner = deps.resolve(match[1]);
      request.bearerToken = match[1];
      return true;
    } catch (error) {
      if (error instanceof Unauthenticated) return false;
      throw error;
    }
  };

  typed.post(
    "/api/v1/sessions",
    {
      schema: {
        body: loginInputSchema,
        response: {
          201: sessionResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const input = request.body;
      // Counted before verifying, so throttled attempts never reach scrypt.
      const retryAfter = deps.throttle.consume([
        `login-ip:${request.ip}`,
        documentBucketKey(input, deps.documentSecret),
      ]);
      if (retryAfter !== null) {
        reply.header("Retry-After", String(retryAfter));
        reply.code(429);
        return safeError(
          "RATE_LIMITED",
          "Demasiados intentos. Intenta más tarde.",
        );
      }
      try {
        const session = await deps.login(input);
        reply.code(201);
        return session;
      } catch (error) {
        if (error instanceof InvalidCredentials) {
          reply.code(401);
          return safeError("INVALID_CREDENTIALS", error.message);
        }
        throw error;
      }
    },
  );

  typed.get(
    "/api/v1/me",
    {
      schema: {
        querystring: emptyInputSchema,
        response: {
          200: accountResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!authenticate(request) || !request.owner) {
        reply.code(401);
        return safeError("UNAUTHENTICATED", "Sesión no válida.");
      }
      return deps.account(request.owner);
    },
  );

  typed.delete(
    "/api/v1/sessions/current",
    {
      schema: {
        querystring: emptyInputSchema,
        response: {
          204: z.undefined(),
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      // No body is expected. Anything else is refused, so an ID for another user is never read.
      if (hasBodyFields(request.body)) {
        reply.code(400);
        return safeError("VALIDATION_ERROR", "Revisa los datos enviados.");
      }
      if (!authenticate(request) || !request.bearerToken) {
        reply.code(401);
        return safeError("UNAUTHENTICATED", "Sesión no válida.");
      }
      deps.revoke(request.bearerToken);
      return reply.code(204).send();
    },
  );
  done();
};

function hasBodyFields(body: unknown): boolean {
  if (body === undefined || body === null || body === "") return false;
  return !(
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).length === 0
  );
}
