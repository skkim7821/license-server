import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";

const ADMIN_TOKEN = "test-admin-token";
process.env.ADMIN_TOKEN = ADMIN_TOKEN;

const productCreate = vi.fn();
const productFindUnique = vi.fn();
const productFindMany = vi.fn();
const licenseCreate = vi.fn();
const licenseFindMany = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    product: {
      create: productCreate,
      findUnique: productFindUnique,
      findMany: productFindMany,
    },
    license: {
      create: licenseCreate,
      findMany: licenseFindMany,
    },
  },
}));

let adminRoutes: FastifyPluginAsync;

beforeAll(async () => {
  const module = await import("./admin");
  adminRoutes = module.adminRoutes;
});

async function buildApp() {
  const app = Fastify();
  await app.register(adminRoutes, { prefix: "/admin" });
  return app;
}

describe("adminRoutes", () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  test("requires the admin token", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/admin/products",
      payload: { code: "PROD" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized" });
    expect(productCreate).not.toHaveBeenCalled();
  });

  test("creates products with normalized fields", async () => {
    const productResult = {
      code: "PROD",
      name: "Normalized",
      maxDevices: 3,
      defaultPeriod: 14,
    };
    productCreate.mockResolvedValue(productResult);

    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/admin/products",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: {
        code: " prod ",
        name: "  Normalized ",
        maxDevices: 3,
        defaultPeriod: 14,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ product: productResult });
    expect(productCreate).toHaveBeenCalledWith({
      data: {
        code: "PROD",
        name: "Normalized",
        maxDevices: 3,
        defaultPeriod: 14,
      },
    });
  });

  test("rejects product creation with missing data", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/admin/products",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: {
        code: "PROD",
        name: "",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Missing required fields" });
    expect(productCreate).not.toHaveBeenCalled();
  });

  test("creates licenses when the product exists", async () => {
    const productRecord = {
      code: "PROD",
      defaultPeriod: 5,
      maxDevices: 2,
    };
    const licenseResult = {
      id: "license-abc",
      email: "owner@example.com",
      productCode: "PROD",
      expiresAt: "2030-01-01T00:00:00.000Z",
      status: "active",
      maxDevices: 2,
    };
    productFindUnique.mockResolvedValue(productRecord);
    licenseCreate.mockResolvedValue(licenseResult);

    const beforeCall = Date.now();

    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/admin/licenses",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: {
        email: "Owner@example.com ",
        productCode: " prod ",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ license: licenseResult });
    expect(productFindUnique).toHaveBeenCalledWith({ where: { code: "PROD" } });
    expect(licenseCreate).toHaveBeenCalledTimes(1);

    const createdPayload = licenseCreate.mock.calls[0][0].data;
    expect(createdPayload).toMatchObject({
      email: "owner@example.com",
      productCode: "PROD",
      status: "active",
      maxDevices: 2,
    });
    expect(createdPayload.expiresAt).toBeInstanceOf(Date);
    const expectedMinExpiration = beforeCall + productRecord.defaultPeriod * 24 * 60 * 60 * 1000 - 500;
    expect(createdPayload.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinExpiration);
  });

  test("returns 404 when product for license cannot be found", async () => {
    productFindUnique.mockResolvedValue(null);

    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/admin/licenses",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: {
        email: "owner@example.com",
        productCode: "missing",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Product not found" });
    expect(licenseCreate).not.toHaveBeenCalled();
  });

  test("bulk endpoint creates missing product and licenses", async () => {
    productFindUnique.mockResolvedValueOnce(null);
    productCreate.mockResolvedValue({
      code: "BULK",
      name: "Bulk Product",
      maxDevices: 5,
      defaultPeriod: 10,
    });

    const licenseResult1 = {
      id: "license-1",
      email: "user1@example.com",
      productCode: "BULK",
      expiresAt: "2040-01-01T00:00:00.000Z",
      status: "active",
      maxDevices: 5,
    };
    const licenseResult2 = {
      id: "license-2",
      email: "user2@example.com",
      productCode: "BULK",
      expiresAt: "2041-01-01T00:00:00.000Z",
      status: "revoked",
      maxDevices: 3,
    };
    licenseCreate.mockResolvedValueOnce(licenseResult1).mockResolvedValueOnce(licenseResult2);

    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/admin/bulk/licenses",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: {
        product: {
          code: " bulk ",
          name: " Bulk Product ",
          maxDevices: 5,
          defaultPeriod: 10,
        },
        licenses: [
          { email: "USER1@EXAMPLE.COM" },
          { email: "user2@example.com", maxDevices: 3, expiresInDays: 60, status: "revoked" },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      product: {
        code: "BULK",
        name: "Bulk Product",
        maxDevices: 5,
        defaultPeriod: 10,
      },
      licenses: [licenseResult1, licenseResult2],
    });

    expect(productFindUnique).toHaveBeenCalledWith({ where: { code: "BULK" } });
    expect(productCreate).toHaveBeenCalledTimes(1);

    const [firstCall, secondCall] = licenseCreate.mock.calls;
    expect(firstCall[0].data).toMatchObject({
      email: "user1@example.com",
      productCode: "BULK",
      status: "active",
      maxDevices: 5,
    });
    expect(firstCall[0].data.expiresAt).toBeInstanceOf(Date);

    expect(secondCall[0].data).toMatchObject({
      email: "user2@example.com",
      status: "revoked",
      maxDevices: 3,
    });
  });

  test("bulk endpoint reuses existing product and skips creation", async () => {
    const productRecord = {
      code: "REUSE",
      name: "Existing",
      maxDevices: 4,
      defaultPeriod: 7,
    };
    productFindUnique.mockResolvedValue(productRecord);
    licenseCreate.mockResolvedValue({
      id: "license-3",
      email: "reuse@example.com",
      productCode: "REUSE",
      expiresAt: "2042-01-01T00:00:00.000Z",
      status: "active",
      maxDevices: 4,
    });

    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/admin/bulk/licenses",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: {
        product: {
          code: "reuse",
          name: "Existing",
          maxDevices: 4,
          defaultPeriod: 7,
        },
        licenses: [{ email: "reuse@example.com" }],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(productCreate).not.toHaveBeenCalled();
    expect(productFindUnique).toHaveBeenCalledWith({ where: { code: "REUSE" } });
    expect(licenseCreate).toHaveBeenCalledTimes(1);
  });

  test("lists products in ascending code order", async () => {
    const products = [
      {
        code: "ALPHA",
        name: "Alpha",
        maxDevices: 2,
        defaultPeriod: 30,
      },
      {
        code: "BETA",
        name: "Beta",
        maxDevices: 5,
        defaultPeriod: 14,
      },
    ];
    productFindMany.mockResolvedValue(products);

    app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/admin/products",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ products });
    expect(productFindMany).toHaveBeenCalledWith({
      orderBy: { code: "asc" },
      select: {
        code: true,
        name: true,
        maxDevices: true,
        defaultPeriod: true,
      },
    });
  });

  test("lists licenses in ascending email order", async () => {
    const licenses = [
      {
        id: "license-a",
        email: "a@example.com",
        productCode: "PROD",
        expiresAt: "2043-01-01T00:00:00.000Z",
        status: "active",
        maxDevices: 2,
      },
      {
        id: "license-b",
        email: "b@example.com",
        productCode: "PROD",
        expiresAt: "2043-01-02T00:00:00.000Z",
        status: "revoked",
        maxDevices: 1,
      },
    ];
    licenseFindMany.mockResolvedValue(licenses);

    app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/admin/licenses",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ licenses });
    expect(licenseFindMany).toHaveBeenCalledWith({
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
  });
});
