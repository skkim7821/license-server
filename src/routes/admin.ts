import { addDays } from "date-fns";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { prisma } from "../db";
import { generateLicenseKey } from "../utils/license-key";
import { verifyPassword } from "../utils/password";

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

const updateProductPayloadSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    maxDevices: { type: "integer", minimum: 1 },
    defaultPeriod: { type: "integer", minimum: 1 },
  },
  anyOf: [{ required: ["name"] }, { required: ["maxDevices"] }, { required: ["defaultPeriod"] }],
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

const userPayloadSchema = {
  type: "object",
  required: ["email"],
  properties: {
    email: { type: "string", format: "email" },
    name: { type: "string" },
  },
};

const updateUserPayloadSchema = {
  type: "object",
  properties: {
    email: { type: "string", format: "email" },
    name: { type: "string" },
  },
  anyOf: [{ required: ["email"] }, { required: ["name"] }],
};

const userResponseSchema = {
  type: "object",
  properties: {
    user: {
      type: "object",
      properties: {
        id: { type: "string" },
        email: { type: "string", format: "email" },
        name: { type: "string", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id", "email", "name", "createdAt", "updatedAt"],
    },
  },
};

const usersListResponseSchema = {
  type: "object",
  properties: {
    users: {
      type: "array",
      items: userResponseSchema.properties.user,
    },
  },
  required: ["users"],
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
        licenseKey: { type: "string" },
        email: { type: "string", format: "email" },
        productCode: { type: "string" },
        expiresAt: { type: "string", format: "date-time" },
        status: { type: "string" },
        maxDevices: { type: "integer" },
      },
      required: ["id", "licenseKey", "email", "productCode", "expiresAt", "status", "maxDevices"],
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
          licenseKey: { type: "string" },
          email: { type: "string", format: "email" },
          productCode: { type: "string" },
          expiresAt: { type: "string", format: "date-time" },
          status: { type: "string" },
          maxDevices: { type: "integer" },
        },
        required: ["id", "licenseKey", "email", "productCode", "expiresAt", "status", "maxDevices"],
      },
    },
  },
};

const licenseIdParamsSchema = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string" },
  },
};

const productCodeParamsSchema = {
  type: "object",
  required: ["code"],
  properties: {
    code: { type: "string" },
  },
};

const extendLicensePayloadSchema = {
  type: "object",
  required: ["days"],
  properties: {
    days: { type: "integer", minimum: 1 },
  },
};

const changeLicenseStatusPayloadSchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", enum: ["active", "revoked", "expired"] },
  },
};

const deleteLicenseResponseSchema = {
  type: "object",
  required: ["deleted", "id"],
  properties: {
    deleted: { type: "boolean" },
    id: { type: "string" },
  },
};

const deleteUserResponseSchema = {
  type: "object",
  required: ["deleted", "id"],
  properties: {
    deleted: { type: "boolean" },
    id: { type: "string" },
  },
};

const deleteProductResponseSchema = {
  type: "object",
  required: ["deleted", "code"],
  properties: {
    deleted: { type: "boolean" },
    code: { type: "string" },
  },
};

const adminLoginPayloadSchema = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string", minLength: 1 },
  },
};

const adminLoginResponseSchema = {
  type: "object",
  required: ["token", "role", "type"],
  properties: {
    token: { type: "string" },
    role: { type: "string" },
    type: { type: "string", enum: ["jwt", "static"] },
  },
};

type CreateProductBody = {
  code: string;
  name: string;
  maxDevices: number;
  defaultPeriod: number;
};

type UpdateProductBody = {
  name?: string;
  maxDevices?: number;
  defaultPeriod?: number;
};

type CreateLicenseBody = {
  email: string;
  productCode: string;
};

type CreateUserBody = {
  email: string;
  name?: string;
};

type UpdateUserBody = {
  email?: string;
  name?: string | null;
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

type LicenseIdParams = {
  id: string;
};

type ExtendLicenseBody = {
  days: number;
};

type ChangeLicenseStatusBody = {
  status: "active" | "revoked" | "expired";
};

type AdminLoginBody = {
  email: string;
  password: string;
};

type AdminJwtPayload = {
  sub: string;
  role: "super_admin" | "operator";
  type: "admin";
};

type AdminRole = "super_admin" | "operator";

type AdminAuthContext = {
  adminId: string;
  role: AdminRole;
  authType: "jwt" | "static";
};

type LicenseInsertPayload = {
  email: string;
  userId?: string;
  productCode: string;
  expiresAt: Date;
  status: "active" | "revoked" | "expired";
  maxDevices: number;
};

function isUniqueLicenseKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: string }).code;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return code === "P2002" && Array.isArray(target) && target.includes("licenseKey");
}

async function createLicenseWithGeneratedKey(payload: LicenseInsertPayload) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.license.create({
        data: {
          ...payload,
          licenseKey: generateLicenseKey(),
        },
      });
    } catch (error) {
      if (isUniqueLicenseKeyError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("failed_to_generate_unique_license_key");
}

async function ensureUserByEmail(email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  return prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {},
    create: {
      email: normalizedEmail,
    },
  });
}

function extractBearerToken(request: FastifyRequest): string | null {
  const auth = request.headers["authorization"];
  if (!auth) {
    return null;
  }

  if (!auth.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.slice("Bearer ".length).trim();
  return token || null;
}

function setAdminContext(request: FastifyRequest, context: AdminAuthContext): void {
  (request as FastifyRequest & { adminContext?: AdminAuthContext }).adminContext = context;
}

function getAdminContext(request: FastifyRequest): AdminAuthContext | null {
  return (request as FastifyRequest & { adminContext?: AdminAuthContext }).adminContext || null;
}

function verifyAdminJwt(token: string): AdminJwtPayload | null {
  const jwtSecret = process.env.ADMIN_JWT_SECRET;
  if (!jwtSecret) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as AdminJwtPayload;
    if (decoded.type !== "admin") {
      return null;
    }
    if (decoded.role !== "super_admin" && decoded.role !== "operator") {
      return null;
    }
    if (!decoded.sub) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

function signAdminJwt(adminId: string, role: "super_admin" | "operator"): string | null {
  const jwtSecret = process.env.ADMIN_JWT_SECRET;
  if (!jwtSecret) {
    return null;
  }

  const expiresIn = (process.env.ADMIN_JWT_EXPIRES_IN || "12h") as jwt.SignOptions["expiresIn"];
  const signOptions: jwt.SignOptions = {
    subject: adminId,
    expiresIn,
  };

  return jwt.sign({ role, type: "admin" }, jwtSecret, signOptions);
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const bearerToken = extractBearerToken(request);
  if (!bearerToken) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const jwtPayload = verifyAdminJwt(bearerToken);
  if (jwtPayload) {
    setAdminContext(request, {
      adminId: jwtPayload.sub,
      role: jwtPayload.role,
      authType: "jwt",
    });
    return;
  }

  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken && bearerToken === adminToken) {
    setAdminContext(request, {
      adminId: "static-admin",
      role: "super_admin",
      authType: "static",
    });
    return;
  }

  return reply.status(401).send({ error: "Unauthorized" });
}

function requireRoles(allowedRoles: AdminRole[]) {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply) {
    await requireAdmin(request, reply);
    if (reply.sent) {
      return;
    }

    const context = getAdminContext(request);
    if (!context || !allowedRoles.includes(context.role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }
  };
}

const requireSuperAdmin = requireRoles(["super_admin"]);

export async function adminRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/login",
    {
      schema: {
        summary: "Admin login",
        description: "Authenticates an admin user and returns a bearer token.",
        tags: ["admin"],
        body: adminLoginPayloadSchema,
        response: {
          200: adminLoginResponseSchema,
          401: productErrorSchema,
          503: productErrorSchema,
        },
      },
      attachValidation: true,
    },
    async (request, reply) => {
      const { email, password } = request.body as AdminLoginBody;
      const normalizedEmail = email.toLowerCase().trim();

      const adminUser = await prisma.adminUser.findUnique({
        where: { email: normalizedEmail },
      });

      if (adminUser && adminUser.status === "active" && verifyPassword(password, adminUser.passwordHash)) {
        const signedToken = signAdminJwt(adminUser.id, adminUser.role);

        if (signedToken) {
          await prisma.adminUser.update({
            where: { id: adminUser.id },
            data: {
              lastLoginAt: new Date(),
            },
          });

          return reply.send({
            token: signedToken,
            role: adminUser.role,
            type: "jwt",
          });
        }
      }

      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;
      const adminToken = process.env.ADMIN_TOKEN;

      if (adminEmail && adminPassword && adminToken) {
        if (
          normalizedEmail === adminEmail.toLowerCase().trim() &&
          password === adminPassword
        ) {
          return reply.send({
            token: adminToken,
            role: "super_admin",
            type: "static",
          });
        }
      }

      const hasAnyAuthConfig = Boolean(process.env.ADMIN_JWT_SECRET || adminToken);
      if (!hasAnyAuthConfig) {
        return reply.status(503).send({ error: "admin_auth_not_configured" });
      }

      return reply.status(401).send({ error: "invalid_credentials" });
    }
  );

  fastify.post(
    "/users",
    {
      schema: {
        summary: "Create a user",
        description: "Creates or updates a user identified by email.",
        tags: ["admin"],
        body: userPayloadSchema,
        response: {
          201: userResponseSchema,
          400: productErrorSchema,
          401: productErrorSchema,
          403: productErrorSchema,
        },
        security: [{ bearerAuth: [] }],
      },
      attachValidation: true,
      preHandler: requireSuperAdmin,
    },
    async (request, reply) => {
      const { email, name } = request.body as CreateUserBody;
      const normalizedEmail = email?.toLowerCase().trim();
      const normalizedName = name?.trim();

      if (!normalizedEmail) {
        return reply.status(400).send({ error: "Missing required fields" });
      }

      const user = await prisma.user.upsert({
        where: { email: normalizedEmail },
        update: {
          name: normalizedName ?? undefined,
        },
        create: {
          email: normalizedEmail,
          name: normalizedName,
        },
      });

      return reply.status(201).send({ user });
    }
  );

  fastify.get(
    "/users",
    {
      schema: {
        summary: "List users",
        description: "Returns all users in ascending email order.",
        tags: ["admin"],
        response: {
          200: usersListResponseSchema,
          401: productErrorSchema,
        },
        security: [{ bearerAuth: [] }],
      },
      preHandler: requireAdmin,
    },
    async (_request, reply) => {
      const users = await prisma.user.findMany({
        orderBy: { email: "asc" },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return reply.send({ users });
    }
  );

  fastify.patch(
    "/users/:id",
    {
      schema: {
        summary: "Update a user",
        description: "Updates user email and/or name.",
        tags: ["admin"],
        params: licenseIdParamsSchema,
        body: updateUserPayloadSchema,
        response: {
          200: userResponseSchema,
          400: productErrorSchema,
          401: productErrorSchema,
          403: productErrorSchema,
          404: productErrorSchema,
        },
        security: [{ bearerAuth: [] }],
      },
      attachValidation: true,
      preHandler: requireSuperAdmin,
    },
    async (request, reply) => {
      const { id } = request.params as LicenseIdParams;
      const { email, name } = request.body as UpdateUserBody;

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      const normalizedEmail = email?.toLowerCase().trim();
      const normalizedName = typeof name === "string" ? name.trim() : name;

      const user = await prisma.user.update({
        where: { id },
        data: {
          email: normalizedEmail || undefined,
          name: normalizedName === undefined ? undefined : normalizedName,
        },
      });

      return reply.send({ user });
    }
  );

  fastify.delete(
    "/users/:id",
    {
      schema: {
        summary: "Delete a user",
        description: "Deletes a user when no licenses are attached.",
        tags: ["admin"],
        params: licenseIdParamsSchema,
        response: {
          200: deleteUserResponseSchema,
          401: productErrorSchema,
          403: productErrorSchema,
          404: productErrorSchema,
          409: productErrorSchema,
        },
        security: [{ bearerAuth: [] }],
      },
      preHandler: requireSuperAdmin,
    },
    async (request, reply) => {
      const { id } = request.params as LicenseIdParams;
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      const attachedLicenses = await prisma.license.count({
        where: { userId: id },
      });

      if (attachedLicenses > 0) {
        return reply.status(409).send({ error: "user_has_licenses" });
      }

      await prisma.user.delete({
        where: { id },
      });
      return reply.send({ deleted: true, id });
    }
  );

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

  fastify.patch(
    "/products/:code",
    {
      schema: {
        summary: "Update a product",
        description: "Updates product metadata by code.",
        tags: ["admin"],
        params: productCodeParamsSchema,
        body: updateProductPayloadSchema,
        response: {
          200: productResponseSchema,
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
      const { code } = request.params as { code: string };
      const { name, maxDevices, defaultPeriod } = request.body as UpdateProductBody;
      const normalizedCode = code.trim().toUpperCase();

      const existing = await prisma.product.findUnique({
        where: { code: normalizedCode },
      });
      if (!existing) {
        return reply.status(404).send({ error: "Product not found" });
      }

      const product = await prisma.product.update({
        where: { code: normalizedCode },
        data: {
          name: typeof name === "string" ? name.trim() : undefined,
          maxDevices: typeof maxDevices === "number" ? Number(maxDevices) : undefined,
          defaultPeriod: typeof defaultPeriod === "number" ? Number(defaultPeriod) : undefined,
        },
      });

      return reply.send({ product });
    }
  );

  fastify.delete(
    "/products/:code",
    {
      schema: {
        summary: "Delete a product",
        description: "Deletes a product if there are no attached licenses.",
        tags: ["admin"],
        params: productCodeParamsSchema,
        response: {
          200: deleteProductResponseSchema,
          401: productErrorSchema,
          404: productErrorSchema,
          409: productErrorSchema,
        },
        security: [{ bearerAuth: [] }],
      },
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const normalizedCode = code.trim().toUpperCase();

      const existing = await prisma.product.findUnique({
        where: { code: normalizedCode },
      });
      if (!existing) {
        return reply.status(404).send({ error: "Product not found" });
      }

      const attachedLicenses = await prisma.license.count({
        where: { productCode: normalizedCode },
      });
      if (attachedLicenses > 0) {
        return reply.status(409).send({ error: "product_has_licenses" });
      }

      await prisma.product.delete({
        where: { code: normalizedCode },
      });
      return reply.send({ deleted: true, code: normalizedCode });
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
      const user = await ensureUserByEmail(email);

      const license = await createLicenseWithGeneratedKey({
        email: email.toLowerCase().trim(),
        userId: user.id,
        productCode: product.code,
        expiresAt,
        status: "active",
        maxDevices: product.maxDevices,
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
          licenseKey: true,
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

        const user = await ensureUserByEmail(normalizedEmail);

        const license = await createLicenseWithGeneratedKey({
          email: normalizedEmail,
          userId: user.id,
          productCode: product.code.toUpperCase(),
          expiresAt: addDays(new Date(), expiresInDays),
          status,
          maxDevices,
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

  fastify.patch(
    "/licenses/:id/extend",
    {
      schema: {
        summary: "Extend a license expiration",
        description: "Extends an existing license by the provided number of days.",
        tags: ["admin"],
        params: licenseIdParamsSchema,
        body: extendLicensePayloadSchema,
        response: {
          200: licenseResponseSchema,
          400: productErrorSchema,
          401: productErrorSchema,
          403: productErrorSchema,
          404: productErrorSchema,
        },
        security: [{ bearerAuth: [] }],
      },
      attachValidation: true,
      preHandler: requireSuperAdmin,
    },
    async (request, reply) => {
      const { id } = request.params as LicenseIdParams;
      const { days } = request.body as ExtendLicenseBody;

      const license = await prisma.license.findUnique({ where: { id } });
      if (!license) {
        return reply.status(404).send({ error: "License not found" });
      }

      const now = new Date();
      const baseDate = license.expiresAt > now ? license.expiresAt : now;
      const extendedExpiresAt = addDays(baseDate, Number(days));
      const nextStatus = extendedExpiresAt > now ? "active" : license.status;

      const updated = await prisma.license.update({
        where: { id },
        data: {
          expiresAt: extendedExpiresAt,
          status: nextStatus,
        },
      });

      return reply.send({ license: updated });
    }
  );

  fastify.patch(
    "/licenses/:id/status",
    {
      schema: {
        summary: "Change license status",
        description: "Updates the status of an existing license.",
        tags: ["admin"],
        params: licenseIdParamsSchema,
        body: changeLicenseStatusPayloadSchema,
        response: {
          200: licenseResponseSchema,
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
      const { id } = request.params as LicenseIdParams;
      const { status } = request.body as ChangeLicenseStatusBody;

      const license = await prisma.license.findUnique({ where: { id } });
      if (!license) {
        return reply.status(404).send({ error: "License not found" });
      }

      const updateData =
        status === "expired"
          ? {
              status,
              expiresAt: new Date(),
            }
          : {
              status,
            };

      const updated = await prisma.license.update({
        where: { id },
        data: updateData,
      });

      return reply.send({ license: updated });
    }
  );

  fastify.delete(
    "/licenses/:id",
    {
      schema: {
        summary: "Delete a license",
        description: "Deletes a license and all attached device records.",
        tags: ["admin"],
        params: licenseIdParamsSchema,
        response: {
          200: deleteLicenseResponseSchema,
          401: productErrorSchema,
          403: productErrorSchema,
          404: productErrorSchema,
        },
        security: [{ bearerAuth: [] }],
      },
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      const { id } = request.params as LicenseIdParams;
      const license = await prisma.license.findUnique({ where: { id } });
      if (!license) {
        return reply.status(404).send({ error: "License not found" });
      }

      await prisma.licenseDevice.deleteMany({
        where: {
          licenseId: id,
        },
      });
      await prisma.license.delete({
        where: { id },
      });

      return reply.send({ deleted: true, id });
    }
  );
}
