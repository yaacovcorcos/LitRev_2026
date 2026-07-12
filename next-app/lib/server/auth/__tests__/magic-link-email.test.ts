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
        html: expect.stringContaining(
          "You requested a secure sign-in link for LitRev.",
        ),
        text: expect.stringContaining(
          "You requested a secure sign-in link for LitRev.",
        ),
      }),
    );

    const message = transport.mock.calls[0]?.[0];
    expect(message?.html).toContain(
      'href="https://www.papilab.com/api/auth/magic-link/verify?token=abc"',
    );
    expect(message?.html).toContain("If the button does not work");
    expect(message?.html).toContain("If you did not request this email");
    expect(message?.text).toContain(
      "https://www.papilab.com/api/auth/magic-link/verify?token=abc",
    );
    expect(message?.text).toContain("This link expires in 15 minutes.");
  });

  it("escapes the generated URL before inserting it into HTML", async () => {
    const transport = vi.fn<MagicLinkEmailTransport>().mockResolvedValue({
      error: null,
    });

    await sendMagicLinkEmail(
      {
        email: "reader@example.com",
        url: "https://www.papilab.com/verify?token=abc&callback=/ai",
      },
      transport,
    );

    const message = transport.mock.calls[0]?.[0];
    expect(message?.html).toContain(
      "https://www.papilab.com/verify?token=abc&amp;callback=/ai",
    );
    expect(message?.text).toContain(
      "https://www.papilab.com/verify?token=abc&callback=/ai",
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
