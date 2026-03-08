// Canonical responsive tier thresholds.
export const TINY_PHONE_MAX_WIDTH = 479;
export const PHONE_MAX_WIDTH = 767;
export const COMPACT_MAX_WIDTH = 1199;
export const WIDE_MIN_WIDTH = 1200;
export const EXPANSIVE_MIN_WIDTH = 1440;

export const TINY_PHONE_MEDIA_QUERY = `(max-width: ${TINY_PHONE_MAX_WIDTH}px)`;
export const PHONE_MEDIA_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`;
export const COMPACT_MEDIA_QUERY = `(min-width: ${PHONE_MAX_WIDTH + 1}px) and (max-width: ${COMPACT_MAX_WIDTH}px)`;
export const WIDE_MEDIA_QUERY = `(min-width: ${WIDE_MIN_WIDTH}px)`;
export const EXPANSIVE_MEDIA_QUERY = `(min-width: ${EXPANSIVE_MIN_WIDTH}px)`;

// Transitional legacy mobile cutoff. Existing shell/chat runtime surfaces still
// depend on the 900px contract and are reclassified in later mobile-foundation waves.
export const MOBILE_VIEWPORT_MAX_WIDTH = 900;
export const MOBILE_VIEWPORT_MEDIA_QUERY = `(max-width: ${MOBILE_VIEWPORT_MAX_WIDTH}px)`;

export const COARSE_POINTER_MEDIA_QUERY = "(pointer: coarse)";
