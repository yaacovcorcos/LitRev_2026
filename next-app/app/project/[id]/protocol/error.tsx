"use client";

import { ErrorFallback } from "@/components/ErrorFallback";

export default function ProtocolError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback message="Something went wrong loading the protocol." onRetry={reset} />;
}
