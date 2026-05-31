"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import { resolveAuthClientBaseURL } from "@/lib/auth-client-base-url";

export const authClient = createAuthClient({
  baseURL: resolveAuthClientBaseURL(process.env.NEXT_PUBLIC_BETTER_AUTH_URL),
  plugins: [magicLinkClient()],
});
