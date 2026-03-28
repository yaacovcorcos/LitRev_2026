type PlacementHelperOptions<T> = {
  assistantId: string;
  isReservedAssistant: (item: T, assistantId: string) => boolean;
  isMoveableTraceOrProgress: (item: T) => boolean;
};

export function relocateReservedAssistantAfterTraceSuffix<T>(
  items: readonly T[],
  options: PlacementHelperOptions<T>,
): T[] {
  const assistantIndex = items.findIndex((item) => options.isReservedAssistant(item, options.assistantId));
  if (assistantIndex < 0) {
    return [...items];
  }

  let moveEnd = assistantIndex;
  while (
    moveEnd + 1 < items.length
    && options.isMoveableTraceOrProgress(items[moveEnd + 1] as T)
  ) {
    moveEnd += 1;
  }

  if (moveEnd === assistantIndex) {
    return [...items];
  }

  const next = [...items];
  const [assistant] = next.splice(assistantIndex, 1);
  if (assistant === undefined) {
    return [...items];
  }
  next.splice(moveEnd, 0, assistant);
  return next;
}
