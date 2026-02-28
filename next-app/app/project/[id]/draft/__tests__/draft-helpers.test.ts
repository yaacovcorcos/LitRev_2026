import { describe, it, expect } from "vitest";
import {
  formatAuthorsShort,
  studyLabel,
  isBaseSectionKey,
  isDraftMode,
  clamp,
  slugify,
  createCustomSectionId,
  customSectionPlaceholder,
  docHasContent,
  jsonToText,
} from "../draft-helpers";

describe("formatAuthorsShort", () => {
  it("returns 'Unknown' for empty string", () => {
    expect(formatAuthorsShort("")).toBe("Unknown");
  });
  it("returns last name for a single author", () => {
    expect(formatAuthorsShort("John Smith")).toBe("Smith");
  });
  it("returns 'A & B' for two authors", () => {
    expect(formatAuthorsShort("John Smith, Jane Doe")).toBe("Smith & Doe");
  });
  it("returns 'A et al.' for three or more authors", () => {
    expect(formatAuthorsShort("John Smith, Jane Doe, Bob Johnson")).toBe("Smith et al.");
  });
  it("handles 'and' separator", () => {
    expect(formatAuthorsShort("John Smith and Jane Doe")).toBe("Smith & Doe");
  });
});

describe("studyLabel", () => {
  it("combines author and year", () => {
    const study = { authors: "John Smith", year: 2024 } as Parameters<typeof studyLabel>[0];
    expect(studyLabel(study)).toBe("Smith, 2024");
  });
});

describe("isBaseSectionKey", () => {
  it("returns true for valid section key", () => {
    expect(isBaseSectionKey("abstract")).toBe(true);
  });
  it("returns false for null", () => {
    expect(isBaseSectionKey(null)).toBe(false);
  });
  it("returns false for invalid key", () => {
    expect(isBaseSectionKey("not-a-section")).toBe(false);
  });
});

describe("isDraftMode", () => {
  it("returns true for 'section'", () => {
    expect(isDraftMode("section")).toBe(true);
  });
  it("returns true for 'full'", () => {
    expect(isDraftMode("full")).toBe(true);
  });
  it("returns false for null", () => {
    expect(isDraftMode(null)).toBe(false);
  });
  it("returns false for other strings", () => {
    expect(isDraftMode("preview")).toBe(false);
  });
});

describe("clamp", () => {
  it("clamps below min", () => {
    expect(clamp(5, 10, 20)).toBe(10);
  });
  it("clamps above max", () => {
    expect(clamp(25, 10, 20)).toBe(20);
  });
  it("leaves values in range", () => {
    expect(clamp(15, 10, 20)).toBe(15);
  });
});

describe("slugify", () => {
  it("converts to lowercase and replaces spaces", () => {
    expect(slugify("My Custom Section")).toBe("my-custom-section");
  });
  it("removes special characters", () => {
    expect(slugify("Hello! World?")).toBe("hello-world");
  });
  it("trims leading/trailing hyphens", () => {
    expect(slugify("--test--")).toBe("test");
  });
});

describe("createCustomSectionId", () => {
  it("returns id prefixed with custom-", () => {
    const id = createCustomSectionId("My Section");
    expect(id).toMatch(/^custom-my-section-/);
  });
  it("falls back to 'section' for empty slug", () => {
    const id = createCustomSectionId("!!!"); // all special chars → empty slug
    expect(id).toMatch(/^custom-section-/);
  });
});

describe("customSectionPlaceholder", () => {
  it("generates placeholder text", () => {
    expect(customSectionPlaceholder("Methods")).toBe("Draft the Methods section.");
  });
});

describe("docHasContent", () => {
  it("returns false for null", () => {
    expect(docHasContent(null)).toBe(false);
  });
  it("returns false for empty doc", () => {
    expect(docHasContent({ type: "doc", content: [{ type: "paragraph" }] })).toBe(false);
  });
  it("returns true for doc with text", () => {
    expect(
      docHasContent({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
      })
    ).toBe(true);
  });
  it("returns true for doc with citation", () => {
    expect(
      docHasContent({ type: "doc", content: [{ type: "citation" }] })
    ).toBe(true);
  });
  it("returns false for whitespace-only text", () => {
    expect(
      docHasContent({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "   " }] }],
      })
    ).toBe(false);
  });
});

describe("jsonToText", () => {
  it("returns empty string for null", () => {
    expect(jsonToText(null)).toBe("");
  });
  it("extracts paragraph text", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
    };
    expect(jsonToText(doc)).toBe("Hello world");
  });
  it("preserves bold marks as markdown", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }],
        },
      ],
    };
    expect(jsonToText(doc)).toBe("**bold**");
  });
  it("renders citations", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "citation", attrs: { label: "Smith, 2024" } }],
        },
      ],
    };
    expect(jsonToText(doc)).toBe("(Smith, 2024)");
  });
  it("renders headings with # prefix", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Title" }],
        },
      ],
    };
    expect(jsonToText(doc)).toBe("## Title");
  });
});
