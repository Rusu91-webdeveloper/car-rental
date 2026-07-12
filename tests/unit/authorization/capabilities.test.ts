import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  checkAllCapabilities,
  checkAnyCapability,
  checkCapability,
  type CapabilityPrincipal,
} from "@/lib/authorization/capabilities";

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

  it("preserves existing administrator compatibility", () => {
    const administrator: CapabilityPrincipal = {
      authenticated: true,
      userId: "admin-1",
      role: "ADMIN",
      capabilities: new Set(),
    };
    expect(
      checkAllCapabilities(administrator, Object.values(CAPABILITIES)),
    ).toEqual({ allowed: true });
  });
});
