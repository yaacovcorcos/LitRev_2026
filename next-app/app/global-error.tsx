"use client";

import { ErrorFallback } from "@/components/ErrorFallback";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body>
        <ErrorFallback
          title="LitRev could not recover this page"
          message="Refresh the app or try again from a clean navigation."
          onRetry={reset}
        />
      </body>
    </html>
  );
}
