import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { Resend } from "resend";
import { prisma } from "@/lib/server/prisma";
import { getBetterAuthSecret } from "@/lib/server/auth/auth-secret";

type AuthInstance = ReturnType<typeof betterAuth>;

const baseURL =
  process.env.BETTER_AUTH_URL ||
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
  "http://localhost:3000";

const trustedOrigins = Array.from(
  new Set(
    [
      baseURL,
      process.env.BETTER_AUTH_URL,
      process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    ].filter((origin): origin is string => Boolean(origin && origin.trim())),
  ),
);

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const hasGoogleProvider = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

let authInstance: AuthInstance | null = null;

function createAuth(): AuthInstance {
  return betterAuth({
    baseURL,
    secret: getBetterAuthSecret(),
    trustedOrigins,
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    socialProviders: hasGoogleProvider
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : undefined,
    plugins: [
      nextCookies(),
      magicLink({
        expiresIn: 60 * 15,
        async sendMagicLink({ email, url }) {
          if (!resend) {
            throw new Error(
              "RESEND_API_KEY is missing. Configure it before enabling magic-link sign-in.",
            );
          }

          const from = process.env.AUTH_EMAIL_FROM || "LitRev <onboarding@resend.dev>";
          await resend.emails.send({
            from,
            to: email,
            subject: "Your LitRev sign-in link",
            html: `<p>Click to sign in:</p><p><a href="${url}">Sign in to LitRev</a></p><p>This link expires in 15 minutes.</p>`,
          });
        },
      }),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
  });
}

export function getAuth(): AuthInstance {
  if (!authInstance) {
    authInstance = createAuth();
  }
  return authInstance;
}

export type AuthSession = AuthInstance["$Infer"]["Session"];
