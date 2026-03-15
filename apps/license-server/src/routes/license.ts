import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { isAfter } from "date-fns";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { prisma } from "../db";

const verifyLicensePayloadSchema = {
  type: "object",
  required: ["licenseKey"],
  properties: {
    licenseKey: { type: "string" },
    ipAddr: { type: "string", nullable: true },
  },
};

const verifyLicenseSuccessSchema = {
  type: "object",
  required: ["valid", "expiresAt", "remainingDevices"],
  properties: {
    valid: { type: "boolean" },
    expiresAt: { type: "string", format: "date-time" },
    remainingDevices: { type: "integer", minimum: 0 },
  },
};

const verifyLicenseErrorSchema = {
  type: "object",
  properties: {
    valid: { type: "boolean" },
    reason: {
      type: "string",
      enum: [
        "missing_fields",
        "not_found",
        "expired",
        "suspended",
        "revoked",
        "max_devices_reached",
      ],
    },
    blockReason: {
      type: "string",
      enum: ["abuse", "manual_review", "security_risk", "server_impact", "billing_issue", "other"],
      nullable: true,
    },
    blockNote: { type: "string", nullable: true },
  },
};

const userInfoQuerySchema = {
  type: "object",
  required: ["email"],
  properties: {
    email: { type: "string", format: "email" },
    name: { type: "string" },
  },
};

const userInfoProductSchema = {
  type: "object",
  required: ["code", "name", "expiresAt", "status"],
  properties: {
    code: { type: "string" },
    name: { type: "string" },
    expiresAt: { type: "string", format: "date-time" },
    status: { type: "string" },
  },
};

const userInfoResponseSchema = {
  type: "object",
  required: ["email", "products"],
  properties: {
    email: { type: "string", format: "email" },
    products: {
      type: "array",
      items: userInfoProductSchema,
    },
  },
};

const userInfoErrorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
  },
};

type VerifyLicenseBody = {
  licenseKey: string;
  ipAddr?: string;
};

type UserInfoQuery = {
  email: string;
  name?: string;
};

type LicenseWithProduct = Prisma.LicenseGetPayload<{ include: { product: true } }>;

export type LicenseRoutePrisma = Pick<PrismaClient, "license" | "licenseDevice">;

function normalizeClientAddress(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === "::ffff:127.0.0.1") {
    return "127.0.0.1";
  }

  return lowered === "localhost" ? "127.0.0.1" : trimmed;
}

function isLoopbackAddress(value: string) {
  return value === "127.0.0.1" || value === "::1";
}

function isCountableDeviceAddress(value?: string | null) {
  const normalized = normalizeClientAddress(value ?? undefined);
  return normalized.length > 0 && !isLoopbackAddress(normalized);
}

const registerVerifyRoute = (fastify: FastifyInstance, prismaInstance: LicenseRoutePrisma) => {
  fastify.post(
    "/verify",
    {
      schema: {
        summary: "Verify an active license",
        description: "Validates a license by license key and registers the caller IP.",
        tags: ["license"],
        body: verifyLicensePayloadSchema,
        response: {
          200: verifyLicenseSuccessSchema,
          400: verifyLicenseErrorSchema,
          403: verifyLicenseErrorSchema,
          404: verifyLicenseErrorSchema,
        },
      },
      attachValidation: true,
    },
    async (request, reply) => {
      const {
        licenseKey: rawLicenseKey,
        ipAddr: providedIpAddr,
      } = request.body as VerifyLicenseBody;
      const normalizedLicenseKey = rawLicenseKey?.trim().toUpperCase();

      if (!normalizedLicenseKey) {
        return reply.status(400).send({ valid: false, reason: "missing_fields" });
      }
      const forwardedHeader = Array.isArray(request.headers["x-forwarded-for"])
        ? request.headers["x-forwarded-for"][0]
        : request.headers["x-forwarded-for"];
      const providedIp = normalizeClientAddress(providedIpAddr);
      const forwardedIp = normalizeClientAddress(forwardedHeader?.split(",")[0]);
      const requestIp = normalizeClientAddress(request.ip);
      const socketIp = normalizeClientAddress(request.socket.remoteAddress);

      // Prefer non-loopback identity to avoid counting proxy loopback (127.0.0.1) as an extra device.
      const resolvedIpAddr =
        (providedIp && !isLoopbackAddress(providedIp) ? providedIp : "") ||
        (forwardedIp && !isLoopbackAddress(forwardedIp) ? forwardedIp : "") ||
        (requestIp && !isLoopbackAddress(requestIp) ? requestIp : "") ||
        providedIp ||
        forwardedIp ||
        requestIp ||
        socketIp;

      if (!resolvedIpAddr) {
        return reply.status(400).send({ valid: false, reason: "missing_fields" });
      }

      const license = await prismaInstance.license.findUnique({
        where: {
          licenseKey: normalizedLicenseKey,
        },
        include: {
          devices: true,
        },
      });

      if (!license) {
        return reply.status(404).send({ valid: false, reason: "not_found" });
      }

      const now = new Date();
      if (license.status === "suspended" || license.status === "revoked") {
        return reply.status(403).send({
          valid: false,
          reason: license.status,
          blockReason: license.blockReason ?? null,
          blockNote: license.blockNote ?? null,
        });
      }

      const isLicenseExpired = !isAfter(license.expiresAt, now);
      if (isLicenseExpired || license.status === "expired") {
        return reply.status(403).send({ valid: false, reason: "expired" });
      }

      if (license.status !== "active") {
        return reply.status(403).send({ valid: false, reason: "revoked" });
      }

      const existingDevice = license.devices.find(
        (device) => normalizeClientAddress(device.ipAddr) === normalizeClientAddress(resolvedIpAddr)
      );
      const countedDevices = license.devices.filter((device) => isCountableDeviceAddress(device.ipAddr));
      const countedDeviceCount = countedDevices.length;

      if (existingDevice) {
        const remaining = Math.max(license.maxDevices - countedDeviceCount, 0);
        return reply.send({
          valid: true,
          expiresAt: license.expiresAt,
          remainingDevices: remaining,
        });
      }

      if (!isCountableDeviceAddress(resolvedIpAddr)) {
        const remaining = Math.max(license.maxDevices - countedDeviceCount, 0);
        return reply.send({
          valid: true,
          expiresAt: license.expiresAt,
          remainingDevices: remaining,
        });
      }

      if (countedDeviceCount >= license.maxDevices) {
        return reply.status(403).send({ valid: false, reason: "max_devices_reached" });
      }

      await prismaInstance.licenseDevice.create({
        data: {
          licenseId: license.id,
          ipAddr: resolvedIpAddr,
        },
      });

      const remaining = Math.max(license.maxDevices - (countedDeviceCount + 1), 0);
      return reply.send({
        valid: true,
        expiresAt: license.expiresAt,
        remainingDevices: remaining,
      });
    }
  );

  fastify.get(
    "/user-info",
    {
      schema: {
        summary: "Fetch purchased products for an email",
        description: "Returns the products that match the provided email address.",
        tags: ["license"],
        querystring: userInfoQuerySchema,
        response: {
          200: userInfoResponseSchema,
          400: userInfoErrorSchema,
          404: userInfoErrorSchema,
        },
      },
      attachValidation: true,
    },
    async (request, reply) => {
      const { email, name } = request.query as UserInfoQuery;

      if (!email) {
        return reply.status(400).send({ error: "missing_fields" });
      }

      const normalizedEmail = email.toLowerCase().trim();

      if (!normalizedEmail) {
        return reply.status(400).send({ error: "missing_fields" });
      }

      const normalizedName = name?.trim();

      const licenses = await prismaInstance.license.findMany({
        where: {
          email: normalizedEmail,
        },
        include: {
          product: true,
        },
      });

      let filteredLicenses = licenses;

      if (normalizedName) {
        const lowerName = normalizedName.toLowerCase();
        filteredLicenses = licenses.filter(
          (license) => license.product.name.toLowerCase() === lowerName
        );
      }

      if (!filteredLicenses.length) {
        return reply.status(404).send({ error: "not_found" });
      }

      const products = filteredLicenses.map((license: LicenseWithProduct) => ({
        code: license.product.code,
        name: license.product.name,
        expiresAt: license.expiresAt,
        status: license.status,
      }));

      return reply.send({
        email: normalizedEmail,
        products,
      });
    }
  );
};

export function licenseRoutesFactory(prismaInstance: LicenseRoutePrisma = prisma): FastifyPluginAsync {
  return async function (fastify) {
    registerVerifyRoute(fastify, prismaInstance);
  };
}

export const licenseRoutes = licenseRoutesFactory();
