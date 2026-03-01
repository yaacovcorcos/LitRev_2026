/**
 * Client-side utility for handling auth errors from server actions.
 * When a session expires, server actions return errorCode "ACCESS_DENIED".
 * This redirects the user to /login instead of showing a confusing error.
 */
export function isAuthError(result: { success: boolean; errorCode?: string }): boolean {
  return !result.success && result.errorCode === "ACCESS_DENIED";
}

export function redirectToLogin(): void {
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}
