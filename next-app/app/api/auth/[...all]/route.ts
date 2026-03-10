import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

function getHandlers() {
  return toNextJsHandler(getAuth().handler);
}

export function GET(request: Request) {
  return getHandlers().GET(request);
}

export function POST(request: Request) {
  return getHandlers().POST(request);
}

export function PUT(request: Request) {
  return getHandlers().PUT(request);
}

export function PATCH(request: Request) {
  return getHandlers().PATCH(request);
}

export function DELETE(request: Request) {
  return getHandlers().DELETE(request);
}
