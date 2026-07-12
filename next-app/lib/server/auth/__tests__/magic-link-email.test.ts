import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sendMagicLinkEmail,
  type MagicLinkEmailTransport,
} from "@/lib/server/auth/magic-link-email";

const originalFrom = process.env.AUTH_EMAIL_FROM;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalFrom === undefined) {
    delete process.env.AUTH_EMAIL_FROM;
  } else {
    process.env.AUTH_EMAIL_FROM = originalFrom;
  }
});

describe("sendMagicLinkEmail", () => {
  it("sends the generated sign-in link using the configured sender", async () => {
    process.env.AUTH_EMAIL_FROM = "LitRev <login@auth.papilab.com>";
    const transport = vi.fn<MagicLinkEmailTransport>().mockResolvedValue({
      error: null,
    });

    await sendMagicLinkEmail(
      {
        email: "reader@example.com",
        url: "https://www.papilab.com/api/auth/magic-link/verify?token=abc",
      },
      transport,
    );

    expect(transport).toHaveBeenCalledOnce();
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "LitRev <login@auth.papilab.com>",
        to: "reader@example.com",
        subject: "Your LitRev sign-in link",
        html: expect.stringContaining("https://www.papilab.com/api/auth/magic-link/verify?token=abc"),
        text: expect.stringContaining("https://www.papilab.com/api/auth/magic-link/verify?token=abc"),
      }),
    );
  });

  it("rejects the request when Resend returns an API error", async () => {
    const transport = vi.fn<MagicLinkEmailTransport>().mockResolvedValue({
      error: { message: "The sender domain is not verified." },
    });

    await expect(
      sendMagicLinkEmail(
        {
          email: "reader@example.com",
          url: "https://www.papilab.com/api/auth/magic-link/verify?token=abc",
        },
        transport,
      ),
    ).rejects.toThrow(
      "Magic-link email delivery failed: The sender domain is not verified.",
    );
  });
});
