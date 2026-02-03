/**
 * Deep merge two objects, preserving nested fields.
 * Incoming values overwrite existing, but nested objects are merged recursively.
 */
export function mergeDetails(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...existing };

  for (const key of Object.keys(incoming)) {
    const existingVal = existing[key];
    const incomingVal = incoming[key];

    // If both are plain objects, merge recursively
    if (
      existingVal !== null &&
      incomingVal !== null &&
      typeof existingVal === 'object' &&
      typeof incomingVal === 'object' &&
      !Array.isArray(existingVal) &&
      !Array.isArray(incomingVal)
    ) {
      result[key] = mergeDetails(
        existingVal as Record<string, unknown>,
        incomingVal as Record<string, unknown>
      );
    } else {
      // Otherwise, incoming overwrites
      result[key] = incomingVal;
    }
  }

  return result;
}
