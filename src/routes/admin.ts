import { addDays } from "date-fns";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db";

const productPayloadSchema = {
  type: "object",
  required: ["code", "name", "maxDevices", "defaultPeriod"],
  properties: {
    code: { type: "string" },
    name: { type: "string" },
    maxDevices: { type: "integer", minimum: 1 },
    defaultPeriod: { type: "integer", minimum: 1 },
  },
};

const productResponseSchema = {
  type: "object",
  properties: {
    product: {
      type: "object",
      properties: {
        code: { type: "string" },
        name: { type: "string" },
        maxDevices: { type: "integer" },
        defaultPeriod: { type: "integer" },
      },
      required: ["code", "name", "maxDevices", "defaultPeriod"],
    },
  },
};

const productsListResponseSchema = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: productResponseSchema.properties.product,
    },
  },
  required: ["products"],
};

const productErrorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
  },
};

const licensePayloadSchema = {
  type: "object",
  required: ["email", "productCode"],
  properties: {
    email: { type: "string", format: "email" },
    productCode: { type: "string" },
  },
};

const licenseResponseSchema = {
  type: "object",
  properties: {
    license: {
      type: "object",
      properties: {
        id: { type: "string" },
        email: { type: "string", format: "email" },
        productCode: { type: "string" },
        expiresAt: { type: "string", format: "date-time" },
        status: { type: "string" },
        maxDevices: { type: "integer" },
      },
      required: ["id", "email", "productCode", "expiresAt", "status", "maxDevices"],
    },
  },
};

const licensesListResponseSchema = {
  type: "object",
  properties: {
    licenses: {
      type: "array",
      items: licenseResponseSchema.properties.license,
    },
  },
  required: ["licenses"],
};

const bulkLicensePayloadSchema = {
  type: "object",
  required: ["product", "licenses"],
  properties: {
    product: productPayloadSchema,
    licenses: {
      type: "array",
      items: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
          maxDevices: { type: "integer", minimum: 1 },
          expiresInDays: { type: "integer", minimum: 1 },
          status: { type: "string", enum: ["active", "revoked", "expired"] },
        },
      },
    },
  },
};

const bulkLicenseResponseSchema = {
  type: "object",
  properties: {
    product: productResponseSchema.properties.product,
    licenses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          productCode: { type: "string" },
          expiresAt: { type: "string", format: "date-time" },
          status: { type: "string" },
          maxDevices: { type: "integer" },
        },
        required: ["id", "email", "productCode", "expiresAt", "status", "maxDevices"],
      },
    },
  },
};

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  throw new Error("ADMIN_TOKEN must be set to use admin APIs");
}

type CreateProductBody = {
  code: string;
  name: string;
  maxDevices: number;
  defaultPeriod: number;
};

type CreateLicenseBody = {
  email: string;
  productCode: string;
};

type BulkLicenseEntry = {
  email: string;
  maxDevices?: number;
  expiresInDays?: number;
  status?: "active" | "revoked" | "expired";
};

type BulkLicenseBody = {
  product: CreateProductBody;
  licenses: BulkLicenseEntry[];
};

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers["authorization"];
  if (!auth || auth !== `Bearer ${ADMIN_TOKEN}`) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}

export async function adminRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/products",
    {
      schema: {
        summary: "Create a product",
        description: "Registers a product so licenses can reference it.",
        tags: ["admin"],
        body: productPayloadSchema,
        response: {
          201: productResponseSchema,
          400: productErrorSchema,
          401: productErrorSchema,
        },
        security: [{ bearerAuth: [] }],
      },
      attachValidation: true,
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      const { code, name, maxDevices, defaultPeriod } = request.body as CreateProductBody;

      if (!code || !name || !maxDevices || !defaultPeriod) {
        return reply.status(400).send({ error: "Missing required fields" });
      }

      const normalizedCode = code.trim().toUpperCase();

      const product = await prisma.product.create({
        data: {
          code: normalizedCode,
          name: name.trim(),
          maxDevices: Number(maxDevices),
          defaultPeriod: Number(defaultPeriod),
        },
      });

      return reply.status(201).send({ product });
    }
  );
  fastify.get(
    "/products",
    {
      schema: {
        summary: "List registered products",
        description: "Returns every product that has been created in the system.",
        tags: ["admin"],
        response: {
          200: productsListResponseSchema,
          401: productErrorSchema,
        },
        security: [{ bearerAuth: [] }],
      },
      preHandler: requireAdmin,
    },
    async (_request, reply) => {
      const products = await prisma.product.findMany({
        orderBy: { code: "asc" },
        select: {
          code: true,
          name: true,
          maxDevices: true,
          defaultPeriod: true,
        },
      });

      return reply.send({ products });
    }
  );

  fastify.post(
    "/licenses",
    {
      schema: {
        summary: "Issue a license",
        description: "Creates a license for the provided email and product code.",
        tags: ["admin"],
        body: licensePayloadSchema,
        response: {
          201: licenseResponseSchema,
          400: productErrorSchema,
          401: productErrorSchema,
          404: productErrorSchema,
        },
        security: [{ bearerAuth: [] }],
      },
      attachValidation: true,
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      const { email, productCode } = request.body as CreateLicenseBody;

      if (!email || !productCode) {
        return reply.status(400).send({ error: "Missing required fields" });
      }

      const product = await prisma.product.findUnique({
        where: { code: productCode.trim().toUpperCase() },
      });

      if (!product) {
        return reply.status(404).send({ error: "Product not found" });
      }

      const expiresAt = addDays(new Date(), product.defaultPeriod);

      const license = await prisma.license.create({
        data: {
          email: email.toLowerCase().trim(),
          productCode: product.code,
          expiresAt,
          status: "active",
          maxDevices: product.maxDevices,
        },
      });

      return reply.status(201).send({ license });
    }
  );
  fastify.get(
    "/licenses",
    {
      schema: {
        summary: "List licenses",
        description: "Returns every license that has been issued in the system.",
        tags: ["admin"],
        response: {
          200: licensesListResponseSchema,
          401: productErrorSchema,
        },
        security: [{ bearerAuth: [] }],
      },
      preHandler: requireAdmin,
    },
    async (_request, reply) => {
      const licenses = await prisma.license.findMany({
        orderBy: { email: "asc" },
        select: {
          id: true,
          email: true,
          productCode: true,
          expiresAt: true,
          status: true,
          maxDevices: true,
        },
      });

      return reply.send({ licenses });
    }
  );

  fastify.post(
    "/bulk/licenses",
    {
      schema: {
        summary: "Create a product plus multiple licenses",
        description:
          "Registers the product if missing and issues licenses for the provided emails in one request.",
        tags: ["admin"],
        body: bulkLicensePayloadSchema,
        response: {
          201: bulkLicenseResponseSchema,
          400: productErrorSchema,
          401: productErrorSchema,
        },
        security: [{ bearerAuth: [] }],
      },
      attachValidation: true,
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      const { product: productInput, licenses: licenseInputs } = request.body as BulkLicenseBody;

      if (!Array.isArray(licenseInputs) || licenseInputs.length === 0) {
        return reply.status(400).send({ error: "licenses_required" });
      }

      const normalizedProductCode = productInput.code.trim().toUpperCase();
      const normalizedProductName = productInput.name.trim();
      const normalizedMaxDevices = Number(productInput.maxDevices);
      const normalizedDefaultPeriod = Number(productInput.defaultPeriod);

      if (!normalizedProductCode || !normalizedProductName || !normalizedMaxDevices || !normalizedDefaultPeriod) {
        return reply.status(400).send({ error: "Invalid product payload" });
      }

      let product = await prisma.product.findUnique({
        where: { code: normalizedProductCode },
      });

      if (!product) {
        product = await prisma.product.create({
          data: {
            code: normalizedProductCode,
            name: normalizedProductName,
            maxDevices: normalizedMaxDevices,
            defaultPeriod: normalizedDefaultPeriod,
          },
        });
      }

      const createdLicenses = [];
      for (const licenseInput of licenseInputs) {
        const normalizedEmail = licenseInput.email.toLowerCase().trim();

        if (!normalizedEmail) {
          return reply.status(400).send({ error: "Invalid license email" });
        }

        const expiresInDays =
          typeof licenseInput.expiresInDays === "number"
            ? licenseInput.expiresInDays
            : product.defaultPeriod;
        const maxDevices = Number(licenseInput.maxDevices ?? product.maxDevices);
        const status = licenseInput.status ?? "active";

        const license = await prisma.license.create({
          data: {
            email: normalizedEmail,
            productCode: product.code.toUpperCase(),
            expiresAt: addDays(new Date(), expiresInDays),
            status,
            maxDevices,
          },
        });

        createdLicenses.push(license);
      }

      return reply.status(201).send({
        product: {
          code: product.code,
          name: product.name,
          maxDevices: product.maxDevices,
          defaultPeriod: product.defaultPeriod,
        },
        licenses: createdLicenses,
      });
    }
  );
}
