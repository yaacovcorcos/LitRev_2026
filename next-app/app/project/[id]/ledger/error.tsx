"use client";

import { ErrorFallback } from "@/components/ErrorFallback";

export default function LedgerError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback message="Something went wrong loading the ledger." onRetry={reset} />;
}
