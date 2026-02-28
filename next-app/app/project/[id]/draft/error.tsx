"use client";

import { ErrorFallback } from "@/components/ErrorFallback";

export default function DraftError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback message="Something went wrong loading the draft studio." onRetry={reset} />;
}
