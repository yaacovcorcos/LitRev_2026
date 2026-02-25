"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import styles from "./login.module.css";

function normalizeCallbackUrl(input: string | null): string {
  if (!input) return "/";
  if (!input.startsWith("/") || input.startsWith("//")) return "/";
  return input;
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.shell}>
          <section className={styles.card} aria-label="Sign in loading">
            <p className="eyebrow">LitRev</p>
            <h1 className={styles.title}>Sign in</h1>
            <p className={styles.subtitle}>Loading sign-in options...</p>
          </section>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(
    () => normalizeCallbackUrl(searchParams.get("callbackUrl")),
    [searchParams],
  );

  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyGoogle, setBusyGoogle] = useState(false);
  const [busyMagicLink, setBusyMagicLink] = useState(false);
  const [busyQuickAccess, setBusyQuickAccess] = useState(false);

  const isDevRuntime = process.env.NODE_ENV !== "production";
  const devQuickLoginEnabled =
    isDevRuntime || process.env.NEXT_PUBLIC_ENABLE_DEV_QUICK_LOGIN === "1";

  useEffect(() => {
    if (!isPending && session) {
      router.replace(callbackUrl);
    }
  }, [callbackUrl, isPending, router, session]);

  const onGoogleSignIn = async () => {
    setBusyGoogle(true);
    setError(null);
    setStatus(null);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: callbackUrl,
      });

      if (result.error) {
        setError(result.error.message || "Google sign-in failed.");
      }
    } catch {
      setError("Google sign-in failed.");
    } finally {
      setBusyGoogle(false);
    }
  };

  const onMagicLinkSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyMagicLink(true);
    setError(null);
    setStatus(null);

    try {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: callbackUrl,
      });

      if (result.error) {
        setError(result.error.message || "Unable to send magic link.");
      } else {
        setStatus("Magic link sent. Check your inbox.");
      }
    } catch {
      setError("Unable to send magic link.");
    } finally {
      setBusyMagicLink(false);
    }
  };

  const onQuickAccess = async () => {
    setBusyQuickAccess(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/dev/quick-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callbackUrl }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; redirectTo?: string; error?: string }
        | null;

      if (!response.ok || !payload?.ok || !payload.redirectTo) {
        setError(payload?.error || "Quick access sign-in failed.");
        return;
      }

      router.replace(payload.redirectTo);
      router.refresh();
    } catch {
      setError("Quick access sign-in failed.");
    } finally {
      setBusyQuickAccess(false);
    }
  };

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-label="Sign in">
        <p className="eyebrow">LitRev</p>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.subtitle}>
          Continue with Google or request a magic link by email.
        </p>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            void onGoogleSignIn();
          }}
          disabled={busyGoogle || busyMagicLink || busyQuickAccess}
        >
          {busyGoogle ? "Redirecting..." : "Continue with Google"}
        </button>

        {devQuickLoginEnabled ? (
          <button
            type="button"
            className={`${styles.devQuickButton} btn btn-outline`}
            onClick={() => {
              void onQuickAccess();
            }}
            disabled={busyGoogle || busyMagicLink || busyQuickAccess}
          >
            {busyQuickAccess ? "Signing in..." : "Continue as Dev User (Preview)"}
          </button>
        ) : null}

        <div className={styles.orRow}>or</div>

        <form className={styles.form} onSubmit={(event) => {
          void onMagicLinkSignIn(event);
        }}>
          <label htmlFor="magic-link-email" className="sr-only">Email</label>
          <input
            id="magic-link-email"
            className={styles.input}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          <button
            type="submit"
            className="btn btn-outline"
            disabled={busyGoogle || busyMagicLink || busyQuickAccess}
          >
            {busyMagicLink ? "Sending..." : "Send magic link"}
          </button>
        </form>

        {error ? (
          <p className={styles.error} role="alert">{error}</p>
        ) : null}
        {status ? (
          <p className={styles.success} role="status">{status}</p>
        ) : null}
        {!isDevRuntime && !devQuickLoginEnabled ? (
          <p className={styles.helper}>
            Quick access is disabled. Set
            {" "}
            <code>NEXT_PUBLIC_ENABLE_DEV_QUICK_LOGIN=1</code>
            {" "}
            and
            {" "}
            <code>ENABLE_DEV_QUICK_LOGIN=1</code>
            {" "}
            in <code>next-app/.env.local</code>.
          </p>
        ) : null}

        <p className={styles.helper}>
          You will be redirected to <code>{callbackUrl}</code> after sign-in.
        </p>
      </section>
    </main>
  );
}
