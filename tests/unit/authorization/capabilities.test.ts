import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  checkAllCapabilities,
  checkAnyCapability,
  checkCapability,
  type CapabilityPrincipal,
} from "@/lib/authorization/capabilities";
import { PrismaCapabilityRepository } from "@/lib/authorization/capability-repository";
import { databaseUserHasCapability } from "@/lib/authorization/database-capabilities";

const manager: CapabilityPrincipal = {
  authenticated: true,
  userId: "manager-1",
  capabilities: new Set([
    CAPABILITIES.CONFIGURATION_VIEW,
    CAPABILITIES.CONFIGURATION_EDIT,
  ]),
};

describe("capability evaluation", () => {
  it("allows a user with the required capability", () => {
    expect(checkCapability(manager, CAPABILITIES.CONFIGURATION_VIEW)).toEqual({
      allowed: true,
    });
  });

  it("denies a user without the required capability", () => {
    expect(
      checkCapability(manager, CAPABILITIES.CONFIGURATION_ACTIVATE),
    ).toMatchObject({
      allowed: false,
      reason: "UNAUTHORIZED",
    });
  });

  it("allows any-capability checks when one matches", () => {
    expect(
      checkAnyCapability(manager, [
        CAPABILITIES.CONFIGURATION_ACTIVATE,
        CAPABILITIES.CONFIGURATION_EDIT,
      ]),
    ).toEqual({ allowed: true });
  });

  it("requires every capability in an all-capabilities check", () => {
    expect(
      checkAllCapabilities(manager, [
        CAPABILITIES.CONFIGURATION_VIEW,
        CAPABILITIES.CONFIGURATION_ACTIVATE,
      ]),
    ).toMatchObject({
      allowed: false,
      reason: "UNAUTHORIZED",
      missing: [CAPABILITIES.CONFIGURATION_ACTIVATE],
    });
  });

  it("distinguishes an unauthenticated principal", () => {
    expect(
      checkCapability(
        { authenticated: false },
        CAPABILITIES.CONFIGURATION_VIEW,
      ),
    ).toMatchObject({
      allowed: false,
      reason: "UNAUTHENTICATED",
    });
  });

  it("preserves unrelated administrator compatibility but excludes restricted document capabilities", () => {
    const administrator: CapabilityPrincipal = {
      authenticated: true,
      userId: "admin-1",
      role: "ADMIN",
      capabilities: new Set(),
    };
    expect(
      checkAllCapabilities(administrator, [
        CAPABILITIES.CONFIGURATION_VIEW,
        CAPABILITIES.CONFIGURATION_EDIT,
        CAPABILITIES.LEGAL_PUBLISH,
      ]),
    ).toEqual({ allowed: true });
    expect(
      checkAllCapabilities(administrator, [
        CAPABILITIES.DOCUMENTS_VIEW,
        CAPABILITIES.DOCUMENTS_DOWNLOAD,
        CAPABILITIES.DOCUMENTS_DELETE,
        CAPABILITIES.DOCUMENTS_LEGAL_HOLD_MANAGE,
      ]),
    ).toMatchObject({ allowed: false, reason: "UNAUTHORIZED" });
  });

  it("allows restricted document capabilities only when explicitly present", () => {
    const reviewer: CapabilityPrincipal = {
      authenticated: true,
      userId: "reviewer-1",
      capabilities: new Set([CAPABILITIES.DOCUMENTS_VIEW]),
    };
    expect(checkCapability(reviewer, CAPABILITIES.DOCUMENTS_VIEW)).toEqual({
      allowed: true,
    });
    expect(
      checkCapability(reviewer, CAPABILITIES.DOCUMENTS_DOWNLOAD),
    ).toMatchObject({
      allowed: false,
      reason: "UNAUTHORIZED",
    });
  });

  it("combines administrator compatibility with explicitly assigned restricted capabilities", () => {
    const administratorReviewer: CapabilityPrincipal = {
      authenticated: true,
      userId: "admin-reviewer-1",
      role: "ADMIN",
      capabilities: new Set([
        CAPABILITIES.DOCUMENTS_VIEW,
        CAPABILITIES.DOCUMENTS_REVIEW,
      ]),
    };
    expect(
      checkAllCapabilities(administratorReviewer, [
        CAPABILITIES.CONFIGURATION_EDIT,
        CAPABILITIES.DOCUMENTS_VIEW,
        CAPABILITIES.DOCUMENTS_REVIEW,
      ]),
    ).toEqual({ allowed: true });
    expect(
      checkCapability(
        administratorReviewer,
        CAPABILITIES.DOCUMENTS_DOWNLOAD,
      ),
    ).toMatchObject({ allowed: false, reason: "UNAUTHORIZED" });
  });

  it("filters restricted capabilities inherited through ADMIN_COMPAT", async () => {
    const repository = new PrismaCapabilityRepository({
      userAccessRole: {
        findMany: async () => [
          {
            accessRole: {
              key: "ADMIN_COMPAT",
              capabilities: [
                { capability: { key: CAPABILITIES.CONFIGURATION_VIEW } },
                { capability: { key: CAPABILITIES.DOCUMENTS_VIEW } },
              ],
            },
          },
        ],
      },
    } as never);
    await expect(
      repository.findCapabilitiesForUser("admin-1"),
    ).resolves.toEqual(new Set([CAPABILITIES.CONFIGURATION_VIEW]));
  });

  it("denies restricted database capability checks for legacy ADMIN_COMPAT", async () => {
    const db = {
      user: {
        findFirst: async () => ({
          role: "ADMIN",
          accessRoleAssignments: [
            {
              accessRole: {
                key: "ADMIN_COMPAT",
                capabilities: [
                  { capability: { key: CAPABILITIES.DOCUMENTS_VIEW } },
                  { capability: { key: CAPABILITIES.CONFIGURATION_VIEW } },
                ],
              },
            },
          ],
        }),
      },
    } as never;
    await expect(
      databaseUserHasCapability(db, "admin-1", CAPABILITIES.DOCUMENTS_VIEW),
    ).resolves.toBe(false);
    await expect(
      databaseUserHasCapability(db, "admin-1", CAPABILITIES.CONFIGURATION_VIEW),
    ).resolves.toBe(true);
  });

  it.each([
    CAPABILITIES.CONFIGURATION_EDIT,
    CAPABILITIES.CONFIGURATION_VALIDATE,
    CAPABILITIES.CONFIGURATION_ACTIVATE,
  ])(
    "requires the explicit %s capability for non-admin users",
    (capability) => {
      expect(checkCapability(manager, capability).allowed).toBe(
        capability === CAPABILITIES.CONFIGURATION_EDIT,
      );
    },
  );
});
