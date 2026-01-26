import { describe, expect, it } from "vitest";
import { classifyFailure } from "../src/main/classifier.js";

describe("classifyFailure", () => {
  it("returns unknown for empty logs", () => {
    const result = classifyFailure("   ");
    expect(result.tag).toBe("unknown");
    expect(result.actionable).toBe(false);
    expect(result.requiresCopilot).toBe(true);
  });

  it("classifies infra-dominant logs", () => {
    const result = classifyFailure("Runner lost: timeout while waiting for connection reset");
    expect(result.tag).toBe("infra");
    expect(result.actionable).toBe(false);
    expect(result.requiresCopilot).toBe(false);
    expect(result.matched ?? []).toContain("timeout");
  });

  it("classifies code-dominant logs", () => {
    const result = classifyFailure("TypeError: Cannot read property x of undefined");
    expect(result.tag).toBe("code");
    expect(result.actionable).toBe(true);
    expect(result.requiresCopilot).toBe(false);
    expect(result.matched ?? []).toContain("typeerror");
  });

  it("returns unknown when signals are mixed", () => {
    const result = classifyFailure("timeout and error in build step");
    expect(result.tag).toBe("unknown");
    expect(result.actionable).toBe(false);
    expect(result.requiresCopilot).toBe(true);
    expect(result.matched ?? []).toContain("timeout");
    expect(result.matched ?? []).toContain("error");
  });

  it("returns unknown when no keywords match", () => {
    const result = classifyFailure("Something odd happened.");
    expect(result.tag).toBe("unknown");
    expect(result.actionable).toBe(false);
    expect(result.requiresCopilot).toBe(true);
  });
});
