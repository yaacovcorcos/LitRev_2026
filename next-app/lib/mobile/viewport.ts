export function getEffectiveViewportHeight(win: Window): number {
  const visualViewportHeight = win.visualViewport?.height;
  if (typeof visualViewportHeight === "number" && visualViewportHeight > 0) {
    return visualViewportHeight;
  }

  return win.innerHeight;
}

export function getKeyboardInset(win: Window): number {
  const visualViewport = win.visualViewport;
  if (!visualViewport || typeof visualViewport.height !== "number") {
    return 0;
  }

  const offsetTop = typeof visualViewport.offsetTop === "number" ? visualViewport.offsetTop : 0;
  const rawInset = win.innerHeight - visualViewport.height - offsetTop;

  if (!Number.isFinite(rawInset) || rawInset < 80) {
    return 0;
  }

  return Math.round(rawInset);
}

export function setMobileViewportVars(root: HTMLElement, viewportHeight: number, keyboardInset = 0): void {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return;
  }

  root.style.setProperty("--app-vh", `${viewportHeight * 0.01}px`);
  root.style.setProperty("--app-height", `${viewportHeight}px`);
  root.style.setProperty("--keyboard-inset", `${Math.max(0, keyboardInset)}px`);
}
