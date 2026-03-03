"use client";

import { useEffect } from "react";
import { isMobileViewportV2Enabled } from "@/lib/mobile/feature-flags";
import { getEffectiveViewportHeight, setMobileViewportVars } from "@/lib/mobile/viewport";

const MOBILE_MAX_WIDTH_MEDIA_QUERY = "(max-width: 1024px)";

export function MobileViewportRuntime() {
  useEffect(() => {
    if (!isMobileViewportV2Enabled()) {
      return;
    }

    const root = document.documentElement;
    const mediaQuery = window.matchMedia(MOBILE_MAX_WIDTH_MEDIA_QUERY);
    let rafId = 0;
    const clearViewportVars = () => {
      root.style.removeProperty("--app-vh");
      root.style.removeProperty("--app-height");
    };

    const updateViewport = () => {
      if (!mediaQuery.matches) {
        clearViewportVars();
        return;
      }
      const viewportHeight = getEffectiveViewportHeight(window);
      setMobileViewportVars(root, viewportHeight);
    };

    const scheduleUpdate = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(updateViewport);
    };

    const onMediaChange = () => {
      scheduleUpdate();
    };

    updateViewport();

    window.addEventListener("resize", scheduleUpdate, { passive: true });
    window.addEventListener("orientationchange", scheduleUpdate, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleUpdate, { passive: true });

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onMediaChange);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(onMediaChange);
    }

    return () => {
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      clearViewportVars();

      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", onMediaChange);
      } else if (typeof mediaQuery.removeListener === "function") {
        mediaQuery.removeListener(onMediaChange);
      }

      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return null;
}
