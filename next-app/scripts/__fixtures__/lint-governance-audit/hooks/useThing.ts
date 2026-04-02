import { useLayoutEffect } from "react";

export function useThing(dependency: string) {
  useLayoutEffect(() => {
    void dependency;
  }, [dependency]);
}
