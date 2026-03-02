export function getEffectiveViewportHeight(win: Window): number {
  const visualViewportHeight = win.visualViewport?.height;
  if (typeof visualViewportHeight === "number" && visualViewportHeight > 0) {
    return visualViewportHeight;
  }

  return win.innerHeight;
}

export function setMobileViewportVars(root: HTMLElement, viewportHeight: number): void {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return;
  }

  root.style.setProperty("--app-vh", `${viewportHeight * 0.01}px`);
  root.style.setProperty("--app-height", `${viewportHeight}px`);
}
