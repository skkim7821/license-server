import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import jwt from "jsonwebtoken";
import { hashPassword } from "../utils/password";

const ADMIN_TOKEN = "test-admin-token";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "topsecret";
process.env.ADMIN_TOKEN = ADMIN_TOKEN;
process.env.ADMIN_EMAIL = ADMIN_EMAIL;
process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
delete process.env.ADMIN_JWT_SECRET;

const productCreate = vi.fn();
const productFindUnique = vi.fn();
const productFindMany = vi.fn();
const productUpdate = vi.fn();
const productDelete = vi.fn();
const licenseCreate = vi.fn();
const licenseFindMany = vi.fn();
const licenseFindUnique = vi.fn();
const licenseUpdate = vi.fn();
const licenseDelete = vi.fn();
const licenseCount = vi.fn();
const licenseDeviceDeleteMany = vi.fn();
const userUpsert = vi.fn();
const userFindMany = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const userDelete = vi.fn();
const adminUserFindUnique = vi.fn();
const adminUserUpdate = vi.fn();

vi.mock("../db", () => ({
  prisma: {
    product: {
      create: productCreate,
      findUnique: productFindUnique,
      findMany: productFindMany,
      update: productUpdate,
      delete: productDelete,
    },
    license: {
      create: licenseCreate,
      findMany: licenseFindMany,
      findUnique: licenseFindUnique,
      update: licenseUpdate,
      delete: licenseDelete,
      count: licenseCount,
    },
    licenseDevice: {
      deleteMany: licenseDeviceDeleteMany,
    },
    user: {
      upsert: userUpsert,
      findMany: userFindMany,
      findUnique: userFindUnique,
      update: userUpdate,
      delete: userDelete,
    },
    adminUser: {
      findUnique: adminUserFindUnique,
      update: adminUserUpdate,
    },
  },
}));

let adminRoutes: FastifyPluginAsync;

beforeAll(async () => {
  const module = await import("./admin.js");
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
    delete process.env.ADMIN_JWT_SECRET;
    adminUserFindUnique.mockResolvedValue(null);
    adminUserUpdate.mockResolvedValue(undefined);
    licenseCount.mockResolvedValue(0);
    userUpsert.mockResolvedValue({
      id: "user-default",
      email: "owner@example.com",
      name: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
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

  test("logs in with configured admin credentials", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/admin/login",
      payload: {
        email: "ADMIN@EXAMPLE.COM",
        password: ADMIN_PASSWORD,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      token: ADMIN_TOKEN,
      role: "super_admin",
      type: "static",
    });
  });

  test("logs in with admin user and returns jwt token", async () => {
    process.env.ADMIN_JWT_SECRET = "jwt-secret-for-test";
    const password = "jwt-password";
    adminUserFindUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      passwordHash: hashPassword(password),
      role: "operator",
      status: "active",
    });

    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/admin/login",
      payload: {
        email: "admin@example.com",
        password,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { token: string; role: string; type: string };
    expect(body.role).toBe("operator");
    expect(body.type).toBe("jwt");
    expect(typeof body.token).toBe("string");

    const decoded = jwt.verify(body.token, process.env.ADMIN_JWT_SECRET!) as jwt.JwtPayload;
    expect(decoded.role).toBe("operator");
    expect(decoded.type).toBe("admin");
    expect(decoded.sub).toBe("admin-1");
    expect(adminUserUpdate).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: { lastLoginAt: expect.any(Date) },
    });
  });

  test("accepts jwt token on protected routes", async () => {
    process.env.ADMIN_JWT_SECRET = "jwt-secret-for-test";
    const token = jwt.sign(
      { role: "super_admin", type: "admin" },
      process.env.ADMIN_JWT_SECRET,
      { subject: "admin-1", expiresIn: "1h" }
    );

    productCreate.mockResolvedValue({
      code: "PROD",
      name: "Product",
      maxDevices: 3,
      defaultPeriod: 30,
    });

    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/admin/products",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        code: "prod",
        name: "Product",
        maxDevices: 3,
        defaultPeriod: 30,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(productCreate).toHaveBeenCalledTimes(1);
  });

  test("allows operator role to delete licenses", async () => {
    process.env.ADMIN_JWT_SECRET = "jwt-secret-for-test";
    const token = jwt.sign(
      { role: "operator", type: "admin" },
      process.env.ADMIN_JWT_SECRET,
      { subject: "admin-operator", expiresIn: "1h" }
    );
    licenseFindUnique.mockResolvedValue({
      id: "license-z",
      email: "owner@example.com",
      productCode: "PROD",
      status: "active",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      maxDevices: 3,
    });
    licenseDeviceDeleteMany.mockResolvedValue({ count: 0 });
    licenseDelete.mockResolvedValue({
      id: "license-z",
    });

    app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/admin/licenses/license-z",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ deleted: true, id: "license-z" });
    expect(licenseDelete).toHaveBeenCalledWith({
      where: { id: "license-z" },
    });
  });

  test("blocks operator role from creating users", async () => {
    process.env.ADMIN_JWT_SECRET = "jwt-secret-for-test";
    const token = jwt.sign(
      { role: "operator", type: "admin" },
      process.env.ADMIN_JWT_SECRET,
      { subject: "admin-operator", expiresIn: "1h" }
    );

    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "new@example.com", name: "New User" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "Forbidden" });
    expect(userUpsert).not.toHaveBeenCalled();
  });

  test("rejects invalid admin credentials", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/admin/login",
      payload: {
        email: ADMIN_EMAIL,
        password: "wrong-password",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "invalid_credentials" });
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

  test("creates or updates a user", async () => {
    const user = {
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    userUpsert.mockResolvedValue(user);

    app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { email: "OWNER@EXAMPLE.COM", name: " Owner " },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      user: {
        ...user,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    });
    expect(userUpsert).toHaveBeenCalledWith({
      where: { email: "owner@example.com" },
      update: { name: "Owner" },
      create: { email: "owner@example.com", name: "Owner" },
    });
  });

  test("lists users in ascending email order", async () => {
    const users = [
      {
        id: "user-a",
        email: "a@example.com",
        name: "A",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      {
        id: "user-b",
        email: "b@example.com",
        name: null,
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        updatedAt: new Date("2026-01-04T00:00:00.000Z"),
      },
    ];
    userFindMany.mockResolvedValue(users);

    app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      users: users.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
    expect(userFindMany).toHaveBeenCalledWith({
      orderBy: { email: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  test("updates a user", async () => {
    const existing = {
      id: "user-2",
      email: "before@example.com",
      name: "Before",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const updated = {
      ...existing,
      email: "after@example.com",
      name: "After",
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };
    userFindUnique.mockResolvedValue(existing);
    userUpdate.mockResolvedValue(updated);

    app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/admin/users/user-2",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { email: " AFTER@EXAMPLE.COM ", name: " After " },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
    expect(userFindUnique).toHaveBeenCalledWith({ where: { id: "user-2" } });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { email: "after@example.com", name: "After" },
    });
  });

  test("deletes a user without licenses", async () => {
    userFindUnique.mockResolvedValue({
      id: "user-delete-1",
      email: "delete@example.com",
      name: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    licenseCount.mockResolvedValue(0);
    userDelete.mockResolvedValue({ id: "user-delete-1" });

    app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/admin/users/user-delete-1",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ deleted: true, id: "user-delete-1" });
    expect(licenseCount).toHaveBeenCalledWith({ where: { userId: "user-delete-1" } });
    expect(userDelete).toHaveBeenCalledWith({ where: { id: "user-delete-1" } });
  });

  test("rejects deleting a user with attached licenses", async () => {
    userFindUnique.mockResolvedValue({
      id: "user-delete-2",
      email: "linked@example.com",
      name: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    licenseCount.mockResolvedValue(1);

    app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/admin/users/user-delete-2",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "user_has_licenses" });
    expect(userDelete).not.toHaveBeenCalled();
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
      licenseKey: "LIC-AAAA-BBBB-CCCC-DDDD",
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
    expect(createdPayload.licenseKey).toEqual(expect.stringMatching(/^LIC-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){5}$/));
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
      licenseKey: "LIC-1111-1111-1111-1111",
      email: "user1@example.com",
      productCode: "BULK",
      expiresAt: "2040-01-01T00:00:00.000Z",
      status: "active",
      maxDevices: 5,
    };
    const licenseResult2 = {
      id: "license-2",
      licenseKey: "LIC-2222-2222-2222-2222",
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
    expect(firstCall[0].data.licenseKey).toEqual(expect.stringMatching(/^LIC-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){5}$/));
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
      licenseKey: "LIC-3333-3333-3333-3333",
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

  test("updates a product", async () => {
    productFindUnique.mockResolvedValue({
      code: "PROD",
      name: "Old",
      maxDevices: 1,
      defaultPeriod: 7,
    });
    productUpdate.mockResolvedValue({
      code: "PROD",
      name: "New Name",
      maxDevices: 5,
      defaultPeriod: 30,
    });

    app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/admin/products/prod",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { name: " New Name ", maxDevices: 5, defaultPeriod: 30 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      product: {
        code: "PROD",
        name: "New Name",
        maxDevices: 5,
        defaultPeriod: 30,
      },
    });
    expect(productUpdate).toHaveBeenCalledWith({
      where: { code: "PROD" },
      data: {
        name: "New Name",
        maxDevices: 5,
        defaultPeriod: 30,
      },
    });
  });

  test("deletes a product without licenses", async () => {
    productFindUnique.mockResolvedValue({
      code: "PROD",
      name: "Product",
      maxDevices: 2,
      defaultPeriod: 7,
    });
    licenseCount.mockResolvedValue(0);
    productDelete.mockResolvedValue({ code: "PROD" });

    app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/admin/products/prod",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ deleted: true, code: "PROD" });
    expect(licenseCount).toHaveBeenCalledWith({ where: { productCode: "PROD" } });
    expect(productDelete).toHaveBeenCalledWith({ where: { code: "PROD" } });
  });

  test("rejects deleting a product with attached licenses", async () => {
    productFindUnique.mockResolvedValue({
      code: "PROD",
      name: "Product",
      maxDevices: 2,
      defaultPeriod: 7,
    });
    licenseCount.mockResolvedValue(2);

    app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/admin/products/PROD",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "product_has_licenses" });
    expect(productDelete).not.toHaveBeenCalled();
  });

  test("lists licenses in ascending email order", async () => {
    const licenses = [
      {
        id: "license-a",
        licenseKey: "LIC-AAAA-BBBB-CCCC-DDDD",
        email: "a@example.com",
        productCode: "PROD",
        expiresAt: "2043-01-01T00:00:00.000Z",
        status: "active",
        maxDevices: 2,
      },
      {
        id: "license-b",
        licenseKey: "LIC-EEEE-FFFF-GGGG-HHHH",
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
        licenseKey: true,
        email: true,
        productCode: true,
        expiresAt: true,
        status: true,
        maxDevices: true,
      },
    });
  });

  test("extends a license and reactivates when expiration moves to future", async () => {
    const current = {
      id: "license-x",
      licenseKey: "LIC-9999-9999-9999-9999",
      email: "x@example.com",
      productCode: "PROD",
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      status: "expired",
      maxDevices: 2,
    };
    const updated = {
      ...current,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      status: "active",
    };
    licenseFindUnique.mockResolvedValue(current);
    licenseUpdate.mockResolvedValue(updated);

    app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/admin/licenses/license-x/extend",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { days: 30 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      license: {
        ...updated,
        expiresAt: updated.expiresAt.toISOString(),
      },
    });
    expect(licenseFindUnique).toHaveBeenCalledWith({ where: { id: "license-x" } });
    expect(licenseUpdate).toHaveBeenCalledTimes(1);
    expect(licenseUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "license-x" },
      data: { status: "active" },
    });
    expect(licenseUpdate.mock.calls[0][0].data.expiresAt).toBeInstanceOf(Date);
  });

  test("changes a license status to revoked", async () => {
    const current = {
      id: "license-y",
      licenseKey: "LIC-8888-8888-8888-8888",
      email: "y@example.com",
      productCode: "PROD",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      status: "active",
      maxDevices: 1,
    };
    const updated = { ...current, status: "revoked" };
    licenseFindUnique.mockResolvedValue(current);
    licenseUpdate.mockResolvedValue(updated);

    app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/admin/licenses/license-y/status",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      payload: { status: "revoked" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      license: {
        ...updated,
        expiresAt: updated.expiresAt.toISOString(),
      },
    });
    expect(licenseFindUnique).toHaveBeenCalledWith({ where: { id: "license-y" } });
    expect(licenseUpdate).toHaveBeenCalledWith({
      where: { id: "license-y" },
      data: { status: "revoked" },
    });
  });

  test("deletes a license and its devices", async () => {
    const current = {
      id: "license-z",
      licenseKey: "LIC-7777-7777-7777-7777",
      email: "z@example.com",
      productCode: "PROD",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      status: "active",
      maxDevices: 1,
    };
    licenseFindUnique.mockResolvedValue(current);
    licenseDeviceDeleteMany.mockResolvedValue({ count: 1 });
    licenseDelete.mockResolvedValue(current);

    app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/admin/licenses/license-z",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ deleted: true, id: "license-z" });
    expect(licenseDeviceDeleteMany).toHaveBeenCalledWith({
      where: { licenseId: "license-z" },
    });
    expect(licenseDelete).toHaveBeenCalledWith({
      where: { id: "license-z" },
    });
  });
});
