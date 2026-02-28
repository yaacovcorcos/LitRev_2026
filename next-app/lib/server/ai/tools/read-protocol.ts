import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";
import { buildProtocolContext } from "@/lib/ai/prompts/copilot-prompts";
import { createDefaultProtocolData, type ProtocolData } from "@/types/protocol";

const inputSchema = z.object({});

const outputSchema = z.object({
  hasProtocol: z.boolean(),
  protocolContext: z.string(),
  protocol: z.unknown(),
});

export const readProtocolTool: AITool = {
  definition: {
    name: "read_protocol",
    description:
      "Read the current project protocol on demand (research question, PICO, and eligibility criteria). " +
      "Use this when you need exact protocol details before searching, screening, or drafting.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  inputSchema,
  outputSchema,
  autonomy: {
    defaultLevel: 4,
    allowedRange: [4, 4],
    hardCap: 4,
  },
  async execute(_args: Record<string, unknown>, context?: ToolExecutionContext) {
    const projectId = context?.projectId;
    if (!projectId) {
      return { callId: "", result: null, error: "No project context available" };
    }

    try {
      const row = await prisma.protocol.findFirst({
        where: { projectId },
        select: { data: true },
      });

      const protocol = (row?.data as ProtocolData | null) ?? createDefaultProtocolData();
      const protocolContext = buildProtocolContext(protocol);

      return {
        callId: "",
        result: {
          hasProtocol: protocolContext.length > 0,
          protocolContext: protocolContext || "[PROTOCOL_CONTEXT]\nNo protocol defined yet.",
          protocol,
        },
      };
    } catch (error) {
      return {
        callId: "",
        result: null,
        error: error instanceof Error ? error.message : "Failed to read protocol",
      };
    }
  },
};
