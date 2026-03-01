import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { importOpenAccessPdfForStudy } from "@/lib/server/files";

const inputSchema = z.object({
  studyId: z.string().optional(),
  doi: z.string().optional(),
  pmid: z.string().optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  status: z.enum(["imported", "already_exists", "failed"]),
  errorCode: z.string().optional(),
  message: z.string(),
  studyId: z.string().optional(),
  fileAssetId: z.string().optional(),
  filename: z.string().optional(),
  provider: z.string().optional(),
  sourceUrl: z.string().optional(),
  checksumSha256: z.string().optional(),
});

export const fetchOpenPdfTool: AITool = {
  definition: {
    name: "fetch_open_pdf",
    description:
      "Fetch a legal free full-text PDF for an existing study using DOI/PMID open-access sources, then attach it to the study files. Use this when the study has no PDF yet.",
    parameters: {
      type: "object",
      properties: {
        studyId: {
          type: "string",
          description:
            "Study ID. If omitted, defaults to the current study context.",
        },
        doi: {
          type: "string",
          description:
            "Optional DOI override. If omitted, the study's saved DOI is used.",
        },
        pmid: {
          type: "string",
          description:
            "Optional PMID override. If omitted, the study's saved PMID is used.",
        },
      },
      required: [],
    },
  },

  inputSchema,
  outputSchema,

  autonomy: {
    defaultLevel: 2,
    allowedRange: [1, 3],
    hardCap: 3,
  },

  async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
    const projectId = (context?.projectId ?? args.projectId) as string | undefined;
    const studyId = (args.studyId ?? context?.studyId) as string | undefined;
    const doi = typeof args.doi === "string" ? args.doi : undefined;
    const pmid = typeof args.pmid === "string" ? args.pmid : undefined;

    if (!projectId) {
      return { callId: "", result: null, error: "No project context available" };
    }
    if (!studyId) {
      return { callId: "", result: null, error: "No study specified and no study in current view" };
    }

    try {
      const result = await importOpenAccessPdfForStudy(undefined, projectId, studyId, { doi, pmid });
      if (!result.success) {
        return {
          callId: "",
          result: {
            success: false,
            status: "failed",
            errorCode: result.errorCode,
            message: result.error,
            studyId,
          },
          error: result.error,
        };
      }

      const message =
        result.status === "already_exists"
          ? "This PDF is already attached to the study."
          : "Open-access PDF imported successfully.";

      return {
        callId: "",
        result: {
          success: true,
          status: result.status,
          message,
          studyId,
          fileAssetId: result.fileAsset.id,
          filename: result.fileAsset.filename,
          provider: result.provider,
          sourceUrl: result.sourceUrl,
          checksumSha256: result.checksumSha256,
        },
      };
    } catch (error) {
      return {
        callId: "",
        result: {
          success: false,
          status: "failed",
          errorCode: "UNKNOWN_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch open-access PDF.",
          studyId,
        },
        error: error instanceof Error ? error.message : "Failed to fetch open-access PDF.",
      };
    }
  },
};
