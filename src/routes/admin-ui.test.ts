import { afterEach, describe, expect, test } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { adminUiRoutes } from "./admin-ui";

async function buildApp() {
  const app = Fastify();
  await app.register(adminUiRoutes);
  return app;
}

describe("adminUiRoutes", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  test("serves admin ui html page", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/admin-ui",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("License Admin UI");
    expect(response.body).toContain("/admin/login");
    expect(response.body).toContain("/admin/licenses");
  });
});
