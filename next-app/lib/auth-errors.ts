const MAGIC_LINK_CALLBACK_ERROR_MESSAGES = {
  EXPIRED_TOKEN: "That sign-in link expired. Send yourself a new magic link.",
  INVALID_TOKEN: "That sign-in link is no longer valid. Send yourself a new magic link.",
  failed_to_create_session: "We could not start your session. Please send a new magic link.",
  failed_to_create_user: "We could not create your account. Please try again.",
} as const;

export function formatMagicLinkCallbackError(errorCode: string | null): string | null {
  if (!errorCode) return null;
  return MAGIC_LINK_CALLBACK_ERROR_MESSAGES[
    errorCode as keyof typeof MAGIC_LINK_CALLBACK_ERROR_MESSAGES
  ] ?? "We could not complete sign-in. Please send a new magic link.";
}
