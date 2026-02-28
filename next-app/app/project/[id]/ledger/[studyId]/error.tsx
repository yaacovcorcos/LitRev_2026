"use client";

import { ErrorFallback } from "@/components/ErrorFallback";

export default function StudyError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback message="Something went wrong loading this study." onRetry={reset} />;
}
