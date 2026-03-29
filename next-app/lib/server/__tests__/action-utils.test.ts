import { describe, it, expect } from "vitest";
import { withAction, classifyError, sanitizeErrorMessage, getSafeErrorDetails } from "@/lib/server/action-utils";
import { ArtifactError } from "@/lib/server/agent/artifact-errors";

describe("classifyError", () => {
  it("returns NOT_FOUND for 'not found' messages", () => {
    expect(classifyError("Record not found")).toBe("NOT_FOUND");
    expect(classifyError("No rows returned")).toBe("NOT_FOUND");
  });

  it("returns ACCESS_DENIED for permission messages", () => {
    expect(classifyError("Access denied")).toBe("ACCESS_DENIED");
    expect(classifyError("Insufficient permission")).toBe("ACCESS_DENIED");
  });

  it("returns CONFLICT for unique constraint violations", () => {
    expect(classifyError("Unique constraint failed on the fields: (`email`)")).toBe("CONFLICT");
    expect(classifyError("Record already exists")).toBe("CONFLICT");
  });

  it("returns CONFLICT for foreign key constraint violations", () => {
    expect(classifyError("Foreign key constraint failed on the field: `projectId`")).toBe("CONFLICT");
  });

  it("returns VALIDATION for invalid input messages", () => {
    expect(classifyError("Invalid email format")).toBe("VALIDATION");
    expect(classifyError("Field is required")).toBe("VALIDATION");
  });

  it("returns undefined for unrecognized errors", () => {
    expect(classifyError("Connection timeout")).toBeUndefined();
    expect(classifyError("ECONNREFUSED")).toBeUndefined();
    expect(classifyError("")).toBeUndefined();
  });
});

describe("withAction", () => {
  it("returns success with data on successful execution", async () => {
    const result = await withAction(async () => ({ id: "123", name: "test" }));
    expect(result).toEqual({
      success: true,
      data: { id: "123", name: "test" },
    });
  });

  it("returns success with void data for void functions", async () => {
    const result = await withAction(async () => {});
    expect(result).toEqual({
      success: true,
      data: undefined,
    });
  });

  it("returns failure with classified error message for known errors", async () => {
    const result = await withAction(async () => {
      throw new Error("Record not found in database");
    });
    expect(result).toEqual({
      success: false,
      error: "The requested resource was not found.",
      errorCode: "NOT_FOUND",
    });
  });

  it("uses explicit typed error codes before substring classification", async () => {
    const result = await withAction(async () => {
      throw new ArtifactError("ARTIFACT_CONTEXT_MISSING", "Service scope requires ownerId and workspaceId.");
    });
    expect(result).toEqual({
      success: false,
      error: "The artifact could not be applied because required context is missing.",
      errorCode: "ARTIFACT_CONTEXT_MISSING",
    });
  });

  it("returns failure with fallback message for unknown errors", async () => {
    const result = await withAction(async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:5432");
    });
    expect(result).toEqual({
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: undefined,
    });
  });

  it("uses custom fallback message when provided", async () => {
    const result = await withAction(
      async () => { throw new Error("timeout"); },
      "File upload failed. Please try again.",
    );
    expect(result).toEqual({
      success: false,
      error: "File upload failed. Please try again.",
      errorCode: undefined,
    });
  });

  it("handles non-Error thrown values gracefully", async () => {
    const result = await withAction(async () => {
      throw "raw string error";
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Something went wrong. Please try again.");
      expect(result.errorCode).toBeUndefined();
    }
  });

  it("never leaks Prisma error internals", async () => {
    const prismaError = new Error(
      'Invalid `prisma.project.findUnique()` invocation:\n\n' +
      'Error occurred during query execution:\n' +
      'ConnectorError(ConnectorError { user_facing_error: None, kind: ConnectionError(' +
      'Tls(Error(Alert(HandshakeFailure), "postgresql://postgres:SECRET@db.example.com:5432/mydb"))))'
    );
    const result = await withAction(async () => { throw prismaError; });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Must not contain the connection string or SQL
      expect(result.error).not.toContain("postgresql://");
      expect(result.error).not.toContain("SECRET");
      expect(result.error).not.toContain("prisma");
      expect(result.error).not.toContain("ConnectorError");
      // May classify as VALIDATION (due to "Invalid" in Prisma invocation text)
      // — that's fine as long as the raw error is never exposed
    }
  });

  it("classifies Prisma unique constraint error correctly", async () => {
    const prismaError = new Error(
      "Unique constraint failed on the constraint: `Project_workspaceId_name_key`"
    );
    const result = await withAction(async () => { throw prismaError; });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("CONFLICT");
      expect(result.error).toBe("This operation conflicts with existing data.");
    }
  });
});

describe("sanitizeErrorMessage", () => {
  it("returns plain one-line domain messages when allowed", () => {
    const result = sanitizeErrorMessage(
      new Error("PDF extraction service unavailable"),
      "Unknown error during extraction",
      { allowRawMessage: true },
    );
    expect(result).toBe("PDF extraction service unavailable");
  });

  it("keeps safe domain errors when allowRawMessage is enabled", () => {
    const result = sanitizeErrorMessage(
      new Error("Artifact not found"),
      "Failed to get artifact",
      { allowRawMessage: true },
    );
    expect(result).toBe("The requested resource was not found.");
  });

  it("redacts Prisma internals even when raw messages are allowed", () => {
    const result = sanitizeErrorMessage(
      new Error(
        'Invalid `prisma.project.findUnique()` invocation:\n' +
        'ConnectorError(... "postgresql://postgres:SECRET@db.example.com:5432/mydb")',
      ),
      "Failed to fetch project",
      { allowRawMessage: true },
    );
    expect(result).not.toContain("prisma");
    expect(result).not.toContain("postgresql://");
    expect(result).not.toContain("SECRET");
    expect([
      "Failed to fetch project",
      "Invalid input. Please check your data and try again.",
    ]).toContain(result);
  });

  it("redacts credential-bearing URLs", () => {
    const result = sanitizeErrorMessage(
      new Error("Connection failed: postgresql://user:password@localhost:5432/litrev_dev"),
      "Database connection failed",
      { allowRawMessage: true },
    );
    expect(result).toBe("Database connection failed");
  });

  it("falls back when raw messages are not allowed and error is unclassified", () => {
    const result = sanitizeErrorMessage(
      new Error("Unexpected timeout while processing request"),
      "Something went wrong. Please try again.",
    );
    expect(result).toBe("Something went wrong. Please try again.");
  });
});

describe("getSafeErrorDetails", () => {
  it("keeps typed artifact errors out of the legacy substring classifier", () => {
    const result = getSafeErrorDetails(
      new ArtifactError("ARTIFACT_CONTEXT_MISSING", "Field is required"),
      "Fallback",
      { allowRawMessage: true },
    );
    expect(result).toEqual({
      error: "The artifact could not be applied because required context is missing.",
      errorCode: "ARTIFACT_CONTEXT_MISSING",
    });
  });
});
