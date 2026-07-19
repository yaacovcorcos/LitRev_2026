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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildMagicLinkEmail(url: string): Pick<
  MagicLinkEmailMessage,
  "html" | "text"
> {
  const safeUrl = escapeHtml(url);

  return {
    html: `
      <div style="background:#f6f7f9;padding:32px 16px;font-family:Arial,sans-serif;color:#202124;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e3e6ea;border-radius:12px;padding:32px;">
          <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">Sign in to LitRev</h1>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">
            You requested a secure sign-in link for LitRev. Use the button below to continue.
          </p>
          <p style="margin:0 0 24px;">
            <a href="${safeUrl}" style="display:inline-block;background:#1f2937;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:12px 20px;border-radius:8px;">Sign in to LitRev</a>
          </p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#5f6368;">
            This link expires in 15 minutes. If the button does not work, copy and paste this address into your browser:
          </p>
          <p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;">
            <a href="${safeUrl}" style="color:#2563eb;">${safeUrl}</a>
          </p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:#5f6368;">
            If you did not request this email, you can safely ignore it.
          </p>
        </div>
      </div>
    `.trim(),
    text: `Sign in to LitRev

You requested a secure sign-in link for LitRev. Open this link to continue:

${url}

This link expires in 15 minutes. If you did not request this email, you can safely ignore it.`,
  };
}

export async function sendMagicLinkEmail(
  { email, url }: SendMagicLinkEmailInput,
  transport: MagicLinkEmailTransport = sendWithConfiguredResend,
): Promise<void> {
  const from = process.env.AUTH_EMAIL_FROM || "LitRev <onboarding@resend.dev>";
  const content = buildMagicLinkEmail(url);
  const result = await transport({
    from,
    to: email,
    subject: "Your LitRev sign-in link",
    ...content,
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
