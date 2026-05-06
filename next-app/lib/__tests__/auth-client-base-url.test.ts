import { describe, expect, it } from "vitest";
import { resolveAuthClientBaseURL } from "@/lib/auth-client-base-url";

describe("resolveAuthClientBaseURL", () => {
  it("uses same-origin auth calls when local env is pinned to localhost", () => {
    expect(resolveAuthClientBaseURL("http://localhost:3000")).toBeUndefined();
    expect(resolveAuthClientBaseURL("http://127.0.0.1:3005")).toBeUndefined();
    expect(resolveAuthClientBaseURL("http://[::1]:3201")).toBeUndefined();
  });

  it("preserves deployed absolute auth URLs", () => {
    expect(resolveAuthClientBaseURL("https://www.papilab.com")).toBe("https://www.papilab.com");
    expect(resolveAuthClientBaseURL("https://litrev2026.example.vercel.app")).toBe(
      "https://litrev2026.example.vercel.app",
    );
  });

  it("preserves non-local relative or custom values", () => {
    expect(resolveAuthClientBaseURL("/api/auth")).toBe("/api/auth");
    expect(resolveAuthClientBaseURL(undefined)).toBeUndefined();
    expect(resolveAuthClientBaseURL("   ")).toBeUndefined();
  });
});
