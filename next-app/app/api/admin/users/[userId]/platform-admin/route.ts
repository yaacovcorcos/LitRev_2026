import { z } from "zod";
import { requirePlatformAdminApi } from "@/lib/server/auth/platform-admin";
import {
  LastPlatformAdminError,
  PlatformAdminMutationError,
  setPlatformAdminStatus,
} from "@/lib/server/admin/platform-admin-mutations";

const BodySchema = z.object({
  makeAdmin: z.boolean(),
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const authResult = await requirePlatformAdminApi(request);
  if (!authResult.ok) return authResult.response;

  const { userId } = await context.params;

  let payload: z.infer<typeof BodySchema>;
  try {
    payload = BodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await setPlatformAdminStatus({
      actorUserId: authResult.context.userId,
      targetUserId: userId,
      makeAdmin: payload.makeAdmin,
      reason: payload.reason,
      requestId: request.headers.get("x-request-id") ?? undefined,
    });

    return Response.json({ success: true, result }, { status: 200 });
  } catch (error) {
    if (error instanceof LastPlatformAdminError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof PlatformAdminMutationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
