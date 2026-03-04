import { requireApiSession } from "@/lib/server/auth/session";
import { isPlatformAdminUser } from "@/lib/server/auth/platform-admin";

export async function GET(request: Request): Promise<Response> {
  const authResult = await requireApiSession(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const isPlatformAdmin = await isPlatformAdminUser(authResult.context.userId);

  return Response.json({ isPlatformAdmin }, { status: 200 });
}
