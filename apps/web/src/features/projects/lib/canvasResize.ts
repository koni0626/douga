export const MIN_CANVAS_OBJECT_SIZE = 40;

export type ResizeAnchor = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export interface ResizableRectangle {
  height: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
}

export type ResizePatch = Partial<
  Pick<ResizableRectangle, "height" | "width" | "x" | "y">
>;

export function resizeRectangleFromAnchor(
  rectangle: ResizableRectangle,
  anchor: ResizeAnchor,
  deltaX: number,
  deltaY: number,
): ResizePatch {
  const radians = (-rectangle.rotation * Math.PI) / 180;
  const localX = deltaX * Math.cos(radians) - deltaY * Math.sin(radians);
  const localY = deltaX * Math.sin(radians) + deltaY * Math.cos(radians);

  if (anchor === "e" || anchor === "w") {
    const nextWidth = Math.max(
      MIN_CANVAS_OBJECT_SIZE,
      Math.round(rectangle.width + (anchor === "e" ? localX : -localX)),
    );
    return {
      width: nextWidth,
      ...(anchor === "w"
        ? { x: rectangle.x + rectangle.width - nextWidth }
        : {}),
    };
  }

  if (anchor === "n" || anchor === "s") {
    const nextHeight = Math.max(
      MIN_CANVAS_OBJECT_SIZE,
      Math.round(rectangle.height + (anchor === "s" ? localY : -localY)),
    );
    return {
      height: nextHeight,
      ...(anchor === "n"
        ? { y: rectangle.y + rectangle.height - nextHeight }
        : {}),
    };
  }

  const horizontalDelta = anchor.includes("e") ? localX : -localX;
  const verticalDelta = anchor.includes("s") ? localY : -localY;
  const scale = Math.max(
    MIN_CANVAS_OBJECT_SIZE / rectangle.width,
    MIN_CANVAS_OBJECT_SIZE / rectangle.height,
    1 +
      Math.max(
        horizontalDelta / rectangle.width,
        verticalDelta / rectangle.height,
      ),
  );
  const nextWidth = Math.round(rectangle.width * scale);
  const nextHeight = Math.round(rectangle.height * scale);
  return {
    width: nextWidth,
    height: nextHeight,
    ...(anchor.includes("w")
      ? { x: rectangle.x + rectangle.width - nextWidth }
      : {}),
    ...(anchor.includes("n")
      ? { y: rectangle.y + rectangle.height - nextHeight }
      : {}),
  };
}
