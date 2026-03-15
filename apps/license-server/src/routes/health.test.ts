import { afterEach, describe, expect, test } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { healthRoutesFactory } from "./health";

type HealthRoutePrisma = Parameters<typeof healthRoutesFactory>[0];

const createStub = (shouldFail = false): HealthRoutePrisma =>
  ({
    $queryRawUnsafe: async () => {
      if (shouldFail) {
        throw new Error("boom-db");
      }
      return 1;
    },
  }) as unknown as HealthRoutePrisma;

async function buildApp(prismaStub: HealthRoutePrisma) {
  const app = Fastify();
  await app.register(healthRoutesFactory(prismaStub));
  return app;
}

describe("healthRoutes", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  test("returns ok when database query succeeds", async () => {
    app = await buildApp(createStub());

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      checks: {
        db: "ok",
      },
    });
    expect(response.json()).toHaveProperty("timestamp");
  });

  test("returns unhealthy status when database query fails", async () => {
    app = await buildApp(createStub(true));

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "error",
      checks: {
        db: "unhealthy",
      },
      error: "boom-db",
    });
  });
});
