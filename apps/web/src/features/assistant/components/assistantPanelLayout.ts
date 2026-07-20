export const MIN_ASSISTANT_PANEL_WIDTH = 320;

export function assistantPanelMaxWidth(viewportWidth: number): number {
  return Math.max(
    MIN_ASSISTANT_PANEL_WIDTH,
    Math.floor(Math.max(0, viewportWidth) / 2),
  );
}

export function clampAssistantPanelWidth(
  requestedWidth: number,
  viewportWidth: number,
): number {
  return Math.max(
    MIN_ASSISTANT_PANEL_WIDTH,
    Math.min(assistantPanelMaxWidth(viewportWidth), requestedWidth),
  );
}
