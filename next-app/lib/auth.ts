import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { Resend } from "resend";
import { prisma } from "@/lib/server/prisma";
import { getBetterAuthSecret } from "@/lib/server/auth/auth-secret";
import {
  getAuthBaseURL,
  getAuthCookieSecurityOverride,
  getAuthTrustedOrigins,
} from "@/lib/server/auth/auth-origins";

const baseURL = getAuthBaseURL() || undefined;
const authCookieSecurityOverride = getAuthCookieSecurityOverride();
const trustedOrigins = getAuthTrustedOrigins();

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const hasGoogleProvider = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

function createAuth() {
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
        disableSignUp: false,
        expiresIn: 60 * 15,
        storeToken: "hashed",
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
            text: `Sign in to LitRev: ${url}\n\nThis link expires in 15 minutes.`,
          });
        },
      }),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    advanced: authCookieSecurityOverride == null
      ? undefined
      : {
          useSecureCookies: authCookieSecurityOverride,
        },
  });
}

type AuthInstance = ReturnType<typeof createAuth>;

let authInstance: AuthInstance | null = null;

export function getAuth(): AuthInstance {
  if (!authInstance) {
    authInstance = createAuth();
  }
  return authInstance;
}

export type AuthSession = AuthInstance["$Infer"]["Session"];
