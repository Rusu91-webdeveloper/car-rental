import { describe, expect, it } from "vitest";

describe("test infrastructure", () => {
  it("runs TypeScript tests in a deterministic timezone", () => {
    expect(process.env.TZ).toBe("UTC");
  });
});
