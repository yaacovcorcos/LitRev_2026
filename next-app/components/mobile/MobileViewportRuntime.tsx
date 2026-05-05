"use client";

import { useEffect } from "react";
import { isMobileViewportV2Enabled } from "@/lib/mobile/feature-flags";
import { MOBILE_VIEWPORT_MEDIA_QUERY } from "@/lib/mobile/breakpoints";
import { getEffectiveViewportHeight, getKeyboardInset, setMobileViewportVars } from "@/lib/mobile/viewport";

export function MobileViewportRuntime() {
  useEffect(() => {
    if (!isMobileViewportV2Enabled()) {
      return;
    }

    const root = document.documentElement;
    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_MEDIA_QUERY);
    let rafId = 0;
    const clearViewportVars = () => {
      root.style.removeProperty("--app-vh");
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--keyboard-inset");
    };

    const updateViewport = () => {
      if (!mediaQuery.matches) {
        clearViewportVars();
        return;
      }
      const viewportHeight = getEffectiveViewportHeight(window);
      const keyboardInset = getKeyboardInset(window);
      setMobileViewportVars(root, viewportHeight, keyboardInset);
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
