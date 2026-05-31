"use client";

import { ErrorFallback } from "@/components/ErrorFallback";

type RootErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RootError({ reset }: RootErrorProps) {
  return (
    <ErrorFallback
      title="LitRev could not load this page"
      message="The app hit an unexpected error while loading this view."
      onRetry={reset}
    />
  );
}
