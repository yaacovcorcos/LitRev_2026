import { useLayoutEffect } from "react";

export function useThing(dependency: string) {
  /* eslint-disable react-hooks/exhaustive-deps */
  useLayoutEffect(() => {
    void dependency;
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */
}
