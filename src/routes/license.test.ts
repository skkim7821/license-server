import { afterEach, describe, expect, test } from "vitest";
import { addMilliseconds, subSeconds } from "date-fns";
import Fastify, { FastifyInstance } from "fastify";
import { licenseRoutesFactory, LicenseRoutePrisma } from "./license";

type LicenseStatus = "active" | "expired" | "revoked";

type LicenseRecord = {
  id: string;
  licenseKey?: string;
  email: string;
  productCode: string;
  expiresAt: Date;
  status: LicenseStatus;
  maxDevices: number;
  devices: { ipAddr: string }[];
  product?: {
    code: string;
    name: string;
  };
};

type FindUniqueArgs = {
  where: {
    licenseKey: string;
  };
};

function createMockPrisma(initialLicense: LicenseRecord | null) {
  let license = initialLicense
    ? { ...initialLicense, devices: [...initialLicense.devices] }
    : null;
  const licenseRecords: LicenseRecord[] = [];

  const cloneLicenseRecord = (record: LicenseRecord): LicenseRecord => ({
    ...record,
    devices: [...record.devices],
  });

  const syncLicenseRecords = () => {
    if (!license) {
      licenseRecords.length = 0;
      return;
    }

    const snapshot = cloneLicenseRecord({
      ...license,
    });

    if (licenseRecords.length) {
      licenseRecords[0] = snapshot;
    } else {
      licenseRecords.push(snapshot);
    }
  };

  syncLicenseRecords();

  const updateCalls: Array<{ where: { id: string }; data: { status: LicenseStatus } }> = [];
  const createCalls: Array<{ licenseId: string; ipAddr: string }> = [];
  let lastWhere: FindUniqueArgs["where"] | null = null;

  const stub = {
    license: {
      findUnique: async ({ where }: FindUniqueArgs & { include: { devices: boolean } }) => {
        lastWhere = where;
        return license;
      },
      findMany: async ({
        where,
      }: {
        where: {
          email: string;
        };
        include: { product: boolean };
      }) => {
        return licenseRecords.filter((record) => record.email === where.email);
      },
      update: async ({ where, data }: { where: { id: string }; data: { status: LicenseStatus } }) => {
        updateCalls.push({ where, data });
        if (license) {
          license = { ...license, status: data.status };
          syncLicenseRecords();
        }
        return license!;
      },
    },
    licenseDevice: {
      create: async ({ data }: { data: { licenseId: string; ipAddr: string } }) => {
        createCalls.push(data);
        if (license) {
          license = {
            ...license,
            devices: [...license.devices, { ipAddr: data.ipAddr }],
          };
          syncLicenseRecords();
        }
        return { id: "device-created", ...data };
      },
    },
  } as unknown as LicenseRoutePrisma;

  return {
    stub,
    get lastWhere() {
      return lastWhere;
    },
    get updateCalls() {
      return updateCalls;
    },
    get createCalls() {
      return createCalls;
    },
  };
}

async function buildApp(prismaStub: LicenseRoutePrisma) {
  const app = Fastify();
  await app.register(licenseRoutesFactory(prismaStub), { prefix: "/license" });
  return app;
}

describe("licenseRoutes /verify", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  test("rejects payloads with missing fields", async () => {
    const mock = createMockPrisma(null);
    app = await buildApp(mock.stub);

    const response = await app.inject({
      method: "POST",
      url: "/license/verify",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      valid: false,
      reason: "missing_fields",
    });
    expect(mock.lastWhere).toBeNull();
  });

  test("returns not found when license is absent", async () => {
    const mock = createMockPrisma(null);
    app = await buildApp(mock.stub);

    const response = await app.inject({
      method: "POST",
      url: "/license/verify",
      payload: {
        licenseKey: "lic-hello-0000-0000-0000",
        ipAddr: "finger1",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ valid: false, reason: "not_found" });
    expect(mock.lastWhere).toEqual({
      licenseKey: "LIC-HELLO-0000-0000-0000",
    });
  });

  test("verifies a license by license key", async () => {
    const keyedLicense: LicenseRecord = {
      id: "license-keyed",
      licenseKey: "LIC-ABCD-EFGH-IJKL-MNOP",
      email: "owner@example.com",
      productCode: "PROD",
      expiresAt: addMilliseconds(new Date(), 1_000_000),
      status: "active",
      maxDevices: 2,
      devices: [],
    };

    const mock = createMockPrisma(keyedLicense);
    app = await buildApp(mock.stub);

    const response = await app.inject({
      method: "POST",
      url: "/license/verify",
      payload: {
        licenseKey: " lic-abcd-efgh-ijkl-mnop ",
        ipAddr: "device-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      valid: true,
      remainingDevices: 1,
    });
    expect(mock.lastWhere).toEqual({
      licenseKey: "LIC-ABCD-EFGH-IJKL-MNOP",
    });
  });

  test("marks expired licenses and rejects them", async () => {
    const expiredLicense: LicenseRecord = {
      id: "license-1",
      email: "owner@example.com",
      productCode: "PROD",
      expiresAt: subSeconds(new Date(), 1),
      status: "active",
      maxDevices: 3,
      devices: [],
    };
    const mock = createMockPrisma(expiredLicense);
    app = await buildApp(mock.stub);

    const response = await app.inject({
      method: "POST",
      url: "/license/verify",
      payload: {
        licenseKey: "lic-1234-abcd-0000-0000",
        ipAddr: "finger1",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ valid: false, reason: "expired" });
    expect(mock.updateCalls).toEqual([
      { where: { id: "license-1" }, data: { status: "expired" } },
    ]);
  });

  test("falls back to x-forwarded-for header", async () => {
    const license: LicenseRecord = {
      id: "license-5",
      licenseKey: "LIC-AAAA-BBBB-CCCC-DDDD",
      email: "owner@example.com",
      productCode: "PROD",
      expiresAt: addMilliseconds(new Date(), 1_000_000),
      status: "active",
      maxDevices: 3,
      devices: [],
    };
    const mock = createMockPrisma(license);
    app = await buildApp(mock.stub);

    const response = await app.inject({
      method: "POST",
      url: "/license/verify",
      headers: { "x-forwarded-for": " 203.0.113.5, 10.0.0.1 " },
      payload: {
        licenseKey: license.licenseKey,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mock.createCalls).toEqual([
      { licenseId: "license-5", ipAddr: "203.0.113.5" },
    ]);
  });

  test("accepts existing devices without extra creation", async () => {
    const license: LicenseRecord = {
      id: "license-2",
      licenseKey: "LIC-ZZZZ-1111-2222-3333",
      email: "owner@example.com",
      productCode: "PROD",
      expiresAt: addMilliseconds(new Date(), 1_000_000),
      status: "active",
      maxDevices: 3,
      devices: [{ ipAddr: "KNOWN" }],
    };
    const mock = createMockPrisma(license);
    app = await buildApp(mock.stub);

    const response = await app.inject({
      method: "POST",
      url: "/license/verify",
      payload: {
        licenseKey: license.licenseKey,
        ipAddr: "KNOWN",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      valid: true,
      remainingDevices: 2,
    });
    expect(mock.createCalls).toHaveLength(0);
  });

  test("creates new device entries when under the limit", async () => {
    const license: LicenseRecord = {
      id: "license-3",
      licenseKey: "LIC-QQQQ-WWWW-EEEE-RRRR",
      email: "owner@example.com",
      productCode: "PROD",
      expiresAt: addMilliseconds(new Date(), 1_000_000),
      status: "active",
      maxDevices: 2,
      devices: [{ ipAddr: "KNOWN" }],
    };

    const mock = createMockPrisma(license);
    app = await buildApp(mock.stub);

    const response = await app.inject({
      method: "POST",
      url: "/license/verify",
      payload: {
        licenseKey: license.licenseKey,
        ipAddr: "  new-device  ",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      valid: true,
      remainingDevices: 0,
    });
    expect(mock.createCalls).toEqual([
      { licenseId: "license-3", ipAddr: "new-device" },
    ]);
  });

  test("blocks new devices once the limit is reached", async () => {
    const license: LicenseRecord = {
      id: "license-4",
      licenseKey: "LIC-TTTT-YYYY-UUUU-IIII",
      email: "owner@example.com",
      productCode: "PROD",
      expiresAt: addMilliseconds(new Date(), 1_000_000),
      status: "active",
      maxDevices: 1,
      devices: [{ ipAddr: "known" }],
    };

    const mock = createMockPrisma(license);
    app = await buildApp(mock.stub);

    const response = await app.inject({
      method: "POST",
      url: "/license/verify",
      payload: {
        licenseKey: license.licenseKey,
        ipAddr: "brand-new",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ valid: false, reason: "max_devices_reached" });
    expect(mock.createCalls).toHaveLength(0);
  });
});

describe("licenseRoutes /user-info", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  test("returns products for the given email", async () => {
    const license: LicenseRecord = {
      id: "license-userinfo",
      email: "owner@example.com",
      productCode: "PROD",
      expiresAt: addMilliseconds(new Date(), 1_000_000),
      status: "active",
      maxDevices: 2,
      devices: [],
      product: {
        code: "PROD",
        name: "The Product",
      },
    };

    const mock = createMockPrisma(license);
    app = await buildApp(mock.stub);

    const response = await app.inject({
      method: "GET",
      url: "/license/user-info",
      query: {
        email: "OWNER@EXAMPLE.COM",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      email: "owner@example.com",
      products: [
        {
          code: "PROD",
          name: "The Product",
          expiresAt: license.expiresAt.toISOString(),
          status: "active",
        },
      ],
    });
  });

  test("filters products by name when provided", async () => {
    const license: LicenseRecord = {
      id: "license-userinfo",
      email: "owner@example.com",
      productCode: "PROD",
      expiresAt: addMilliseconds(new Date(), 1_000_000),
      status: "active",
      maxDevices: 2,
      devices: [],
      product: {
        code: "PROD",
        name: "The Product",
      },
    };

    const mock = createMockPrisma(license);
    app = await buildApp(mock.stub);

    const response = await app.inject({
      method: "GET",
      url: "/license/user-info",
      query: {
        email: "OWNER@EXAMPLE.COM",
        name: "the product",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.products).toHaveLength(1);
    expect(body.products[0]).toMatchObject({
      name: "The Product",
    });
  });

  test("returns not found when name filters out all matches", async () => {
    const license: LicenseRecord = {
      id: "license-userinfo",
      email: "owner@example.com",
      productCode: "PROD",
      expiresAt: addMilliseconds(new Date(), 1_000_000),
      status: "active",
      maxDevices: 2,
      devices: [],
      product: {
        code: "PROD",
        name: "The Product",
      },
    };

    const mock = createMockPrisma(license);
    app = await buildApp(mock.stub);

    const response = await app.inject({
      method: "GET",
      url: "/license/user-info",
      query: {
        email: "owner@example.com",
        name: "Non Existent",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "not_found" });
  });

  test("returns not found when email has no licenses", async () => {
    const mock = createMockPrisma(null);
    app = await buildApp(mock.stub);

    const response = await app.inject({
      method: "GET",
      url: "/license/user-info",
      query: {
        email: "missing@example.com",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "not_found" });
  });
});
