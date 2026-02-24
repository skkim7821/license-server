#!/usr/bin/env node
import "dotenv/config";
import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { adminRoutes } from "./routes/admin";
import { healthRoutes } from "./routes/health";
import { initDb } from "./db";
import { licenseRoutes } from "./routes/license";

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  await initDb();

  const app = Fastify({ logger: true });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "License Server",
        description: "Administrative and license verification APIs",
        version: "1.0.0",
      },
      servers: [{ url: "/", description: "Default" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });
  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    initOAuth: {},
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
  });

  app.register(healthRoutes);
  app.register(adminRoutes, { prefix: "/admin" });
  app.register(licenseRoutes, { prefix: "/license" });

  await app.listen({ port: PORT, host: "0.0.0.0" });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
