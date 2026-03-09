"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { AuthShellFrame } from "@/app/auth/AuthShellFrame";
import styles from "@/app/login/login.module.css";

type AuthMode = "signin" | "signup";

type AuthScreenProps = {
  mode: AuthMode;
};

function normalizeCallbackUrl(input: string | null): string {
  if (!input) return "/";
  if (!input.startsWith("/") || input.startsWith("//")) return "/";
  return input;
}

export function AuthScreen({ mode }: AuthScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(
    () => normalizeCallbackUrl(searchParams.get("callbackUrl")),
    [searchParams],
  );

  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");

  const isCreateMode = mode === "signup";
  const modeVerb = isCreateMode ? "Create" : "Sign in";

  const isDevRuntime = process.env.NODE_ENV !== "production";
  const devQuickLoginEnabled =
    isDevRuntime || process.env.NEXT_PUBLIC_ENABLE_DEV_QUICK_LOGIN === "1";

  useEffect(() => {
    if (!isPending && session) {
      router.replace(callbackUrl);
    }
  }, [callbackUrl, isPending, router, session]);

  const googleAction = useAsyncAction(
    async () => {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: callbackUrl,
      });
      if (result.error) {
        throw new Error(result.error.message || "Google sign-in failed.");
      }
    },
    { errorMessage: "Google sign-in failed." },
  );

  const magicLinkAction = useAsyncAction(
    async () => {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: callbackUrl,
      });
      if (result.error) {
        throw new Error(result.error.message || "Unable to send magic link.");
      }
    },
    {
      successMessage: "Magic link sent. Check your inbox.",
      errorMessage: "Unable to send magic link.",
    },
  );

  const quickAccessAction = useAsyncAction(
    async () => {
      const response = await fetch("/api/dev/quick-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callbackUrl }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; redirectTo?: string; error?: string }
        | null;

      if (!response.ok || !payload?.ok || !payload.redirectTo) {
        throw new Error(payload?.error || "Quick access sign-in failed.");
      }

      router.replace(payload.redirectTo);
      router.refresh();
    },
    { errorMessage: "Quick access sign-in failed." },
  );

  const anyBusy =
    googleAction.status === "loading" ||
    magicLinkAction.status === "loading" ||
    quickAccessAction.status === "loading";

  const error =
    googleAction.error || magicLinkAction.error || quickAccessAction.error;
  const emailFieldError = magicLinkAction.error;
  const emailHelpId = "magic-link-email-help";
  const emailErrorId = "magic-link-email-error";
  const emailDescribedBy = emailFieldError
    ? `${emailHelpId} ${emailErrorId}`
    : emailHelpId;

  const successStatus =
    magicLinkAction.status === "success"
      ? "Magic link sent. Check your inbox."
      : null;

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void magicLinkAction.execute();
  };

  return (
    <AuthShellFrame ariaLabel={modeVerb} mode={mode}>
      <div className={styles.authPanel}>
        <div className={styles.card}>
          <div className={styles.cardAccent} />

          <form className={styles.form} onSubmit={handleFormSubmit}>
            <label htmlFor="magic-link-email" className={styles.fieldLabel}>
              Email address
            </label>
            <input
              id="magic-link-email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              aria-required="true"
              aria-invalid={Boolean(emailFieldError)}
              aria-describedby={emailDescribedBy}
            />
            <p id={emailHelpId} className={styles.fieldHelp}>
              We&apos;ll send a secure sign-in link to this email.
            </p>
            {emailFieldError ? (
              <p id={emailErrorId} className={styles.fieldError} role="alert">
                {emailFieldError}
              </p>
            ) : null}
            <button
              type="submit"
              className={styles.submitButton}
              disabled={anyBusy}
            >
              {isCreateMode && magicLinkAction.status !== "loading" ? (
                <span className={styles.buttonTextStack}>
                  <span className={styles.buttonHint}>Create with</span>
                  <span className={styles.buttonMain}>Magic link</span>
                </span>
              ) : (
                <span>
                  {magicLinkAction.status === "loading"
                    ? "Sending..."
                    : "Send magic link"}
                </span>
              )}
              {magicLinkAction.status === "loading" ? null : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              )}
            </button>
          </form>

          <div className={styles.orRow}>
            <span />
            <span>OR</span>
            <span />
          </div>

          <div className={styles.socialRow}>
            <button
              type="button"
              className={styles.socialGoogle}
              onClick={() => { void googleAction.execute(); }}
              disabled={anyBusy}
            >
              {/* Google logo colors are brand-required and intentionally fixed. */}
              <svg viewBox="0 0 24 24" className={styles.socialIcon} aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className={styles.socialLabelWrap}>
                {isCreateMode ? <span className={styles.socialHint}>Create with</span> : null}
                <span>Google</span>
              </span>
            </button>

            <button
              type="button"
              className={styles.socialDev}
              onClick={devQuickLoginEnabled ? () => { void quickAccessAction.execute(); } : undefined}
              disabled={!devQuickLoginEnabled || anyBusy}
              data-tooltip={devQuickLoginEnabled ? undefined : "Don\u2019t even think about it"}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.socialIcon}
                aria-hidden="true"
              >
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <span className={styles.socialLabelWrap}>
                <span>
                  {quickAccessAction.status === "loading"
                    ? "Signing in..."
                    : "Dev mode"}
                </span>
              </span>
            </button>
          </div>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          {successStatus ? (
            <p className={styles.success} role="status">
              {successStatus}
            </p>
          ) : null}
        </div>

        {isCreateMode ? (
          <p className={styles.footer}>
            Already have an account?{" "}
            <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className={styles.footerCreateOne}>
              Sign in
            </Link>
          </p>
        ) : (
          <p className={styles.footer}>
            Don&apos;t have an account?{" "}
            <Link href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`} className={styles.footerCreateOne}>
              Create one
            </Link>
          </p>
        )}
      </div>
    </AuthShellFrame>
  );
}
