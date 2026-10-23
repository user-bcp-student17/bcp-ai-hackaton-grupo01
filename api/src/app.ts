import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import {
  emptyInputSchema,
  errorResponseSchema,
  healthResponseSchema,
} from "@wallet/contracts";
import type { ErrorResponse } from "@wallet/contracts";
import Fastify from "fastify";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { authRoutes } from "./features/auth/adapters/http/routes.js";
import { SqliteSessions } from "./features/auth/adapters/persistence/sqlite-sessions.js";
import { LoginThrottle } from "./features/auth/application/login-throttle.js";
import { getAccount } from "./features/auth/application/get-account.js";
import { loginUser } from "./features/auth/application/login-user.js";
import { resolveSession } from "./features/auth/application/resolve-session.js";
import { revokeSession } from "./features/auth/application/revoke-session.js";
import { onboardingRoutes } from "./features/onboarding/adapters/http/routes.js";
import { LocalKyc } from "./features/onboarding/adapters/kyc/local-kyc.js";
import { ScryptPasswords } from "./features/onboarding/adapters/persistence/scrypt-passwords.js";
import { SqliteUsers } from "./features/onboarding/adapters/persistence/sqlite-users.js";
import type { Config } from "./shared/config.js";
import { migrationsDirectory, openDatabase } from "./shared/database.js";
const safeError = (code: string, message: string): ErrorResponse => ({
  error: { code, message },
});

export async function buildApp(deps: {
  config: Config;
  database?: DatabaseSync;
  logger?: FastifyServerOptions["logger"];
  webDirectory?: string;
}): Promise<FastifyInstance> {
  const database =
    deps.database ??
    openDatabase(deps.config.DATABASE_PATH, migrationsDirectory);
  const app = Fastify({
    logger: deps.logger ?? { level: "info" },
    disableRequestLogging: true,
  }).withTypeProvider<ZodTypeProvider>();
  app.addHook("onClose", (_instance, done) => {
    if (database.isOpen) database.close();
    done();
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cors, { origin: deps.config.WEB_ORIGIN });
  if (deps.webDirectory)
    await app.register(fastifyStatic, { root: deps.webDirectory });
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues = z
        .array(z.object({ instancePath: z.string(), keyword: z.string() }))
        .parse(error.validation);
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Revisa los campos enviados.",
          details: issues.map((issue) => ({
            field: issue.instancePath,
            code: issue.keyword,
          })),
        },
      });
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 400
    ) {
      return reply
        .code(400)
        .send(safeError("VALIDATION_ERROR", "Revisa los datos enviados."));
    }
    // Exception messages and raw request values can contain credentials or PII.
    request.log.error({ code: "INTERNAL_ERROR" }, "Error interno de solicitud");
    return reply.code(500).send(safeError("INTERNAL_ERROR", "Error interno."));
  });
  // Unmatched API routes stay JSON; other GET paths fall back to the SPA shell.
  app.setNotFoundHandler((request, reply) => {
    const isSpaRoute =
      deps.webDirectory !== undefined &&
      request.method === "GET" &&
      !request.url.startsWith("/api/");
    if (isSpaRoute) return reply.sendFile("index.html");
    return reply
      .code(404)
      .send(safeError("NOT_FOUND", "Recurso no encontrado."));
  });
  app.get(
    "/api/v1/health",
    {
      schema: {
        querystring: emptyInputSchema,
        response: {
          200: healthResponseSchema,
          400: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    (_request, reply) => {
      try {
        database.prepare("SELECT 1").get();
      } catch {
        app.log.error(
          { code: "STORAGE_UNAVAILABLE" },
          "Almacenamiento no disponible",
        );
        reply.code(503);
        return safeError(
          "STORAGE_UNAVAILABLE",
          "Almacenamiento no disponible.",
        );
      }
      return { status: "ok", simulated: true } as const;
    },
  );
  await app.register(onboardingRoutes, {
    users: new SqliteUsers(database),
    passwords: new ScryptPasswords(),
    kyc: new LocalKyc(deps.config.DEMO_KYC_RESULT),
    now: () => new Date().toISOString(),
    newId: randomUUID,
    openingBalanceCents: deps.config.DEMO_INITIAL_BALANCE_CENTS,
    rateLimit: {
      max: deps.config.AUTH_RATE_LIMIT_MAX,
      windowMs: deps.config.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000,
    },
  });
  const clock = () => new Date();
  const users = new SqliteUsers(database);
  const sessions = new SqliteSessions(database);
  const passwords = new ScryptPasswords();
  // Unknown documents are verified against this hash so both login failures take the same time.
  const dummyPasswordHash = await passwords.hash(randomBytes(32).toString("hex"));
  await app.register(authRoutes, {
    login: loginUser({
      users,
      passwords,
      sessions,
      dummyPasswordHash,
      now: clock,
      newId: randomUUID,
      newToken: () => randomBytes(32).toString("base64url"),
      sessionTtlSeconds: deps.config.SESSION_TTL_SECONDS,
    }),
    revoke: revokeSession({ sessions, now: clock }),
    resolve: resolveSession({ users, sessions, now: clock }),
    account: getAccount({ users }),
    throttle: new LoginThrottle({
      maxAttempts: deps.config.AUTH_RATE_LIMIT_MAX,
      windowSeconds: deps.config.AUTH_RATE_LIMIT_WINDOW_SECONDS,
      now: () => Date.now(),
    }),
    // Per-process secret: the rate-limit store never holds raw document numbers.
    documentSecret: randomBytes(32),
  });
  return app;
}
