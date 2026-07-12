import "server-only";

import { Resend } from "resend";

type MagicLinkEmailMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

type MagicLinkEmailTransportResult = {
  error: { message?: string } | null;
};

export type MagicLinkEmailTransport = (
  message: MagicLinkEmailMessage,
) => Promise<MagicLinkEmailTransportResult>;

type SendMagicLinkEmailInput = {
  email: string;
  url: string;
};

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is missing. Configure it before enabling magic-link sign-in.",
    );
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

const sendWithConfiguredResend: MagicLinkEmailTransport = async (message) => {
  return getResendClient().emails.send(message);
};

export async function sendMagicLinkEmail(
  { email, url }: SendMagicLinkEmailInput,
  transport: MagicLinkEmailTransport = sendWithConfiguredResend,
): Promise<void> {
  const from = process.env.AUTH_EMAIL_FROM || "LitRev <onboarding@resend.dev>";
  const result = await transport({
    from,
    to: email,
    subject: "Your LitRev sign-in link",
    html: `<p>Click to sign in:</p><p><a href="${url}">Sign in to LitRev</a></p><p>This link expires in 15 minutes.</p>`,
    text: `Sign in to LitRev: ${url}\n\nThis link expires in 15 minutes.`,
  });

  if (result.error) {
    const detail = result.error.message?.trim();
    throw new Error(
      detail
        ? `Magic-link email delivery failed: ${detail}`
        : "Magic-link email delivery failed.",
    );
  }
}
