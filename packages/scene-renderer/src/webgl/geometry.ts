import type { CameraTransform } from "../camera";

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
}

export interface TextureCoordinates {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

const FULL_TEXTURE: TextureCoordinates = { u0: 0, u1: 1, v0: 0, v1: 1 };

function rotatePoint(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  degrees: number,
): [number, number] {
  if (degrees === 0) return [x, y];
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const offsetX = x - centerX;
  const offsetY = y - centerY;
  return [
    centerX + offsetX * cosine - offsetY * sine,
    centerY + offsetX * sine + offsetY * cosine,
  ];
}

function transformPoint(
  x: number,
  y: number,
  rectangle: Rectangle,
  camera: CameraTransform,
  logicalWidth: number,
  logicalHeight: number,
): [number, number] {
  const centerX = rectangle.x + rectangle.width / 2;
  const centerY = rectangle.y + rectangle.height / 2;
  const flippedX = centerX + (x - centerX) * (rectangle.flipX ? -1 : 1);
  const flippedY = centerY + (y - centerY) * (rectangle.flipY ? -1 : 1);
  const [layerX, layerY] = rotatePoint(
    flippedX,
    flippedY,
    centerX,
    centerY,
    rectangle.rotation ?? 0,
  );

  const cameraCenterX = logicalWidth / 2;
  const cameraCenterY = logicalHeight / 2;
  const scaledX = cameraCenterX + (layerX - cameraCenterX) * camera.scale;
  const scaledY = cameraCenterY + (layerY - cameraCenterY) * camera.scale;
  const [cameraX, cameraY] = rotatePoint(
    scaledX,
    scaledY,
    cameraCenterX,
    cameraCenterY,
    camera.rotation,
  );
  return [cameraX + camera.x, cameraY + camera.y];
}

function toClipSpace(
  point: [number, number],
  logicalWidth: number,
  logicalHeight: number,
): [number, number] {
  return [
    (point[0] / logicalWidth) * 2 - 1,
    1 - (point[1] / logicalHeight) * 2,
  ];
}

export function buildQuadVertices(
  rectangle: Rectangle,
  camera: CameraTransform,
  logicalWidth: number,
  logicalHeight: number,
  texture: TextureCoordinates = FULL_TEXTURE,
): Float32Array {
  const left = rectangle.x;
  const right = rectangle.x + rectangle.width;
  const top = rectangle.y;
  const bottom = rectangle.y + rectangle.height;
  const topLeft = toClipSpace(
    transformPoint(left, top, rectangle, camera, logicalWidth, logicalHeight),
    logicalWidth,
    logicalHeight,
  );
  const topRight = toClipSpace(
    transformPoint(right, top, rectangle, camera, logicalWidth, logicalHeight),
    logicalWidth,
    logicalHeight,
  );
  const bottomLeft = toClipSpace(
    transformPoint(
      left,
      bottom,
      rectangle,
      camera,
      logicalWidth,
      logicalHeight,
    ),
    logicalWidth,
    logicalHeight,
  );
  const bottomRight = toClipSpace(
    transformPoint(
      right,
      bottom,
      rectangle,
      camera,
      logicalWidth,
      logicalHeight,
    ),
    logicalWidth,
    logicalHeight,
  );

  return new Float32Array([
    topLeft[0],
    topLeft[1],
    texture.u0,
    texture.v0,
    topRight[0],
    topRight[1],
    texture.u1,
    texture.v0,
    bottomLeft[0],
    bottomLeft[1],
    texture.u0,
    texture.v1,
    bottomLeft[0],
    bottomLeft[1],
    texture.u0,
    texture.v1,
    topRight[0],
    topRight[1],
    texture.u1,
    texture.v0,
    bottomRight[0],
    bottomRight[1],
    texture.u1,
    texture.v1,
  ]);
}

export function coverTextureCoordinates(
  sourceWidth: number,
  sourceHeight: number,
  destinationWidth: number,
  destinationHeight: number,
): TextureCoordinates {
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    destinationWidth <= 0 ||
    destinationHeight <= 0
  ) {
    return FULL_TEXTURE;
  }
  const sourceAspect = sourceWidth / sourceHeight;
  const destinationAspect = destinationWidth / destinationHeight;
  if (sourceAspect > destinationAspect) {
    const visible = destinationAspect / sourceAspect;
    return { u0: (1 - visible) / 2, u1: (1 + visible) / 2, v0: 0, v1: 1 };
  }
  const visible = sourceAspect / destinationAspect;
  return { u0: 0, u1: 1, v0: (1 - visible) / 2, v1: (1 + visible) / 2 };
}
