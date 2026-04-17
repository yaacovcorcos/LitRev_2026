import { afterEach, describe, expect, it } from "vitest";
import {
  isDraftVNextMinimalChangeEnabled,
  isProgressiveAnswerStreamingEnabled,
  isScrollOwnershipA1Enabled,
} from "@/lib/feature-flags";

const ORIGINAL_A1 = process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1;
const ORIGINAL_DRAFT_VNEXT_MINIMAL_CHANGE = process.env.NEXT_PUBLIC_DRAFT_VNEXT_MINIMAL_CHANGE;
const ORIGINAL_ENABLE_DRAFT_VNEXT_MINIMAL_CHANGE = process.env.ENABLE_DRAFT_VNEXT_MINIMAL_CHANGE;
const ORIGINAL_PROGRESSIVE_ANSWER_STREAMING_A1 = process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_STREAMING_A1;
const ORIGINAL_ENABLE_PROGRESSIVE_ANSWER_STREAMING_A1 = process.env.ENABLE_PROGRESSIVE_ANSWER_STREAMING_A1;

describe("isScrollOwnershipA1Enabled", () => {
  afterEach(() => {
    if (typeof ORIGINAL_A1 === "undefined") {
      delete process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1;
    } else {
      process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1 = ORIGINAL_A1;
    }
  });

  it("defaults to false when unset", () => {
    delete process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1;
    expect(isScrollOwnershipA1Enabled()).toBe(false);
  });

  it("returns true for truthy values", () => {
    process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1 = "1";
    expect(isScrollOwnershipA1Enabled()).toBe(true);
  });

  it("returns false for falsy values", () => {
    process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1 = "off";
    expect(isScrollOwnershipA1Enabled()).toBe(false);
  });
});

describe("isDraftVNextMinimalChangeEnabled", () => {
  afterEach(() => {
    if (typeof ORIGINAL_DRAFT_VNEXT_MINIMAL_CHANGE === "undefined") {
      delete process.env.NEXT_PUBLIC_DRAFT_VNEXT_MINIMAL_CHANGE;
    } else {
      process.env.NEXT_PUBLIC_DRAFT_VNEXT_MINIMAL_CHANGE = ORIGINAL_DRAFT_VNEXT_MINIMAL_CHANGE;
    }

    if (typeof ORIGINAL_ENABLE_DRAFT_VNEXT_MINIMAL_CHANGE === "undefined") {
      delete process.env.ENABLE_DRAFT_VNEXT_MINIMAL_CHANGE;
    } else {
      process.env.ENABLE_DRAFT_VNEXT_MINIMAL_CHANGE = ORIGINAL_ENABLE_DRAFT_VNEXT_MINIMAL_CHANGE;
    }
  });

  it("defaults to true when unset", () => {
    delete process.env.NEXT_PUBLIC_DRAFT_VNEXT_MINIMAL_CHANGE;
    delete process.env.ENABLE_DRAFT_VNEXT_MINIMAL_CHANGE;
    expect(isDraftVNextMinimalChangeEnabled()).toBe(true);
  });

  it("respects falsy public overrides", () => {
    process.env.NEXT_PUBLIC_DRAFT_VNEXT_MINIMAL_CHANGE = "off";
    delete process.env.ENABLE_DRAFT_VNEXT_MINIMAL_CHANGE;
    expect(isDraftVNextMinimalChangeEnabled()).toBe(false);
  });

  it("falls back to the server override when the public flag is unset", () => {
    delete process.env.NEXT_PUBLIC_DRAFT_VNEXT_MINIMAL_CHANGE;
    process.env.ENABLE_DRAFT_VNEXT_MINIMAL_CHANGE = "0";
    expect(isDraftVNextMinimalChangeEnabled()).toBe(false);
  });
});

describe("isProgressiveAnswerStreamingEnabled", () => {
  afterEach(() => {
    if (typeof ORIGINAL_PROGRESSIVE_ANSWER_STREAMING_A1 === "undefined") {
      delete process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_STREAMING_A1;
    } else {
      process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_STREAMING_A1 = ORIGINAL_PROGRESSIVE_ANSWER_STREAMING_A1;
    }

    if (typeof ORIGINAL_ENABLE_PROGRESSIVE_ANSWER_STREAMING_A1 === "undefined") {
      delete process.env.ENABLE_PROGRESSIVE_ANSWER_STREAMING_A1;
    } else {
      process.env.ENABLE_PROGRESSIVE_ANSWER_STREAMING_A1 = ORIGINAL_ENABLE_PROGRESSIVE_ANSWER_STREAMING_A1;
    }
  });

  it("defaults to true when unset", () => {
    delete process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_STREAMING_A1;
    delete process.env.ENABLE_PROGRESSIVE_ANSWER_STREAMING_A1;
    expect(isProgressiveAnswerStreamingEnabled()).toBe(true);
  });

  it("returns false for falsy public override values", () => {
    process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_STREAMING_A1 = "off";
    delete process.env.ENABLE_PROGRESSIVE_ANSWER_STREAMING_A1;
    expect(isProgressiveAnswerStreamingEnabled()).toBe(false);
  });

  it("falls back to server override when public flag is unset", () => {
    delete process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_STREAMING_A1;
    process.env.ENABLE_PROGRESSIVE_ANSWER_STREAMING_A1 = "0";
    expect(isProgressiveAnswerStreamingEnabled()).toBe(false);
  });
});
