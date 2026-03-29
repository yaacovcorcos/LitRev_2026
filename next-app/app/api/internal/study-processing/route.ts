import { processOneStudyProcessingJob } from "@/lib/server/study-processing";

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const internalToken = process.env.STUDY_PROCESSING_INTERNAL_TOKEN;
  const cronSecret = process.env.CRON_SECRET;

  if (bearer && internalToken && bearer === internalToken) {
    return true;
  }

  if (bearer && cronSecret && bearer === cronSecret) {
    return true;
  }

  const isVercelCron = request.headers.has("x-vercel-cron");
  if (isVercelCron && process.env.NODE_ENV === "production") {
    return true;
  }

  return false;
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processOneStudyProcessingJob();
  return Response.json(result, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
