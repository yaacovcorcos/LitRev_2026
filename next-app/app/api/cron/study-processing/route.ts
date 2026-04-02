import { processOneStudyProcessingJob } from "@/lib/server/study-processing";
import { isAuthorizedStudyProcessingCronRequest } from "@/lib/server/study-processing-dispatch-auth";

function unauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function methodNotAllowedResponse(allow: string) {
  return Response.json(
    { error: "Method Not Allowed" },
    {
      status: 405,
      headers: { Allow: allow },
    },
  );
}

export async function GET(request: Request) {
  if (!isAuthorizedStudyProcessingCronRequest(request)) {
    return unauthorizedResponse();
  }

  const result = await processOneStudyProcessingJob();
  return Response.json(result, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST() {
  return methodNotAllowedResponse("GET");
}
