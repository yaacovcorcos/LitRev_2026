// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  dismissSampleCard,
  isSampleCardDismissed,
  restoreSampleCard,
} from "@/lib/demo/sample-card";

describe("sample card localStorage state", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to visible when not dismissed", () => {
    expect(isSampleCardDismissed()).toBe(false);
  });

  it("persists dismissed state", () => {
    dismissSampleCard();
    expect(isSampleCardDismissed()).toBe(true);
  });

  it("restores visibility by clearing dismissal key", () => {
    dismissSampleCard();
    expect(isSampleCardDismissed()).toBe(true);
    restoreSampleCard();
    expect(isSampleCardDismissed()).toBe(false);
  });

  it("does not collide with guided setup completion keys", () => {
    window.localStorage.setItem("litrev:guided-setup-done:v1:proj-1", "1");
    expect(isSampleCardDismissed()).toBe(false);
  });
});
