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
          disabled={busyGoogle || busyMagicLink}
        >
          {busyGoogle ? "Redirecting..." : "Continue with Google"}
        </button>

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
            disabled={busyGoogle || busyMagicLink}
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

        <p className={styles.helper}>
          You will be redirected to <code>{callbackUrl}</code> after sign-in.
        </p>
      </section>
    </main>
  );
}
