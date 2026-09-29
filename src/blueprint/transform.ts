import type { Blueprint, Operation, Size3, Vec3Tuple } from "./types.js";

export type Rotation = 0 | 90 | 180 | 270;

export function addVec(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function rotatePoint(point: Vec3Tuple, size: Size3, rotation: Rotation): Vec3Tuple {
  const [x, y, z] = point;
  switch (rotation) {
    case 90: return [size.z - 1 - z, y, x];
    case 180: return [size.x - 1 - x, y, size.z - 1 - z];
    case 270: return [z, y, size.x - 1 - x];
    default: return [x, y, z];
  }
}

export function rotatedSize(size: Size3, rotation: Rotation): Size3 {
  return rotation === 90 || rotation === 270
    ? { x: size.z, y: size.y, z: size.x }
    : { ...size };
}

export function playerFacingRotation(view: { x: number; z: number }): Rotation {
  if (Math.abs(view.x) > Math.abs(view.z)) return view.x >= 0 ? 90 : 270;
  return view.z >= 0 ? 0 : 180;
}

export function offsetOperation(operation: Operation, offset: Vec3Tuple): Operation {
  switch (operation.type) {
    case "set_block": case "column": case "door": case "window":
      return { ...operation, at: addVec(operation.at, offset) };
    case "fill": case "floor": case "hollow_box": case "walls": case "line": case "roof":
      return { ...operation, from: addVec(operation.from, offset), to: addVec(operation.to, offset) };
    case "component":
      return { ...operation, at: addVec(operation.at, offset) };
    case "repeat":
      return { ...operation, operation: offsetOperation(operation.operation, offset) };
    case "mirror":
      return { ...operation, pivot: operation.axis === "x" ? operation.pivot + offset[0] : operation.pivot + offset[2], operation: offsetOperation(operation.operation, offset) };
  }
}

function mirrorPoint(point: Vec3Tuple, axis: "x" | "z", pivot: number): Vec3Tuple {
  return axis === "x"
    ? [2 * pivot - point[0], point[1], point[2]]
    : [point[0], point[1], 2 * pivot - point[2]];
}

export function mirrorOperation(operation: Operation, axis: "x" | "z", pivot: number): Operation {
  switch (operation.type) {
    case "set_block": case "column": case "door": case "window":
      return { ...operation, at: mirrorPoint(operation.at, axis, pivot) };
    case "fill": case "floor": case "hollow_box": case "walls": case "line": case "roof":
      return { ...operation, from: mirrorPoint(operation.from, axis, pivot), to: mirrorPoint(operation.to, axis, pivot) };
    case "component":
      return { ...operation, at: mirrorPoint(operation.at, axis, pivot) };
    case "repeat":
      return { ...operation, step: mirrorPoint(operation.step, axis, 0), operation: mirrorOperation(operation.operation, axis, pivot) };
    case "mirror":
      return { ...operation, operation: mirrorOperation(operation.operation, axis, pivot) };
  }
}

export function rotateBlueprintPoint(point: Vec3Tuple, blueprint: Blueprint, rotation: Rotation): Vec3Tuple {
  return rotatePoint(point, blueprint.size, rotation);
}
