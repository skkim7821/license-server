import { FastifyInstance, FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client";
import { prisma } from "../db";

const healthResponseSchema = {
  type: "object",
  required: ["status", "timestamp", "checks"],
  properties: {
    status: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
    checks: {
      type: "object",
      required: ["db"],
      properties: {
        db: { type: "string" },
      },
    },
    error: { type: "string" },
  },
};

type HealthRoutePrisma = Pick<PrismaClient, "$queryRawUnsafe">;

const registerHealthRoute = (fastify: FastifyInstance, prismaInstance: HealthRoutePrisma) => {
  fastify.get(
    "/health",
    {
      schema: {
        summary: "Health check",
        description: "Confirms the server and database are reachable.",
        tags: ["health"],
        response: {
          200: healthResponseSchema,
          503: healthResponseSchema,
        },
      },
    },
    async (_, reply) => {
      const timestamp = new Date().toISOString();

      try {
        await prismaInstance.$queryRawUnsafe("SELECT 1");
        return reply.send({
          status: "ok",
          timestamp,
          checks: {
            db: "ok",
          },
        });
      } catch (error) {
        fastify.log?.error?.(error);
        return reply.status(503).send({
          status: "error",
          timestamp,
          checks: {
            db: "unhealthy",
          },
          error: error instanceof Error ? error.message : "database_check_failed",
        });
      }
    }
  );
};

export function healthRoutesFactory(prismaInstance: HealthRoutePrisma = prisma): FastifyPluginAsync {
  return async function (fastify) {
    registerHealthRoute(fastify, prismaInstance);
  };
}

export const healthRoutes = healthRoutesFactory();
