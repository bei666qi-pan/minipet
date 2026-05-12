import { describe, expect, it } from "vitest";
import { hashPassword, signToken, verifyPassword, verifyToken } from "../src/server/auth";

describe("MiniPet server auth", () => {
  it("signs scoped tokens and verifies password hashes", () => {
    const token = signToken({ sub: "device-1", kind: "device", exp: Math.floor(Date.now() / 1000) + 60 }, "secret");
    expect(verifyToken(token, "secret", "device")?.sub).toBe("device-1");
    expect(verifyToken(token, "secret", "admin")).toBeUndefined();

    const hash = hashPassword("admin-password", "salt");
    expect(verifyPassword("admin-password", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });
});
