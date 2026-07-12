const CONTEXT_MENU_WIDTH_PX = 208;

export function timelineMenuPosition(
  clientX: number,
  clientY: number,
  itemCount: number,
): { x: number; y: number } {
  const margin = 8;
  const estimatedHeight = itemCount * 40 + 12;
  return {
    x: Math.max(
      margin,
      Math.min(clientX, globalThis.innerWidth - CONTEXT_MENU_WIDTH_PX - margin),
    ),
    y: Math.max(
      margin,
      Math.min(clientY, globalThis.innerHeight - estimatedHeight - margin),
    ),
  };
}
