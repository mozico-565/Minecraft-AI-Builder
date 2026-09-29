import type { Primitive } from "../blueprint/compiler.js";
import type { Blueprint, Vec3Tuple } from "../blueprint/types.js";
import { rotateBlueprintPoint, type Rotation } from "../blueprint/transform.js";

export interface WorldOrigin { x: number; y: number; z: number }

function translate(point: Vec3Tuple, origin: WorldOrigin): Vec3Tuple {
  return [origin.x + point[0], origin.y + point[1], origin.z + point[2]];
}

export function transformPrimitives(primitives: Primitive[], blueprint: Blueprint, origin: WorldOrigin, rotation: Rotation): Primitive[] {
  return primitives.map(primitive => {
    if (primitive.kind === "set") {
      return { ...primitive, at: translate(rotateBlueprintPoint(primitive.at, blueprint, rotation), origin) };
    }
    const a = translate(rotateBlueprintPoint(primitive.from, blueprint, rotation), origin);
    const b = translate(rotateBlueprintPoint(primitive.to, blueprint, rotation), origin);
    return {
      ...primitive,
      from: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])] as Vec3Tuple,
      to: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])] as Vec3Tuple
    };
  });
}

export function calculateBounds(blueprint: Blueprint, origin: WorldOrigin, rotation: Rotation): { from: Vec3Tuple; to: Vec3Tuple } {
  const localCorners: Vec3Tuple[] = [
    [0, 0, 0],
    [blueprint.size.x - 1, 0, 0],
    [0, blueprint.size.y - 1, blueprint.size.z - 1],
    [blueprint.size.x - 1, blueprint.size.y - 1, blueprint.size.z - 1]
  ];
  const corners: Vec3Tuple[] = localCorners.map(point => translate(rotateBlueprintPoint(point, blueprint, rotation), origin));
  return {
    from: [Math.min(...corners.map(p => p[0])), Math.min(...corners.map(p => p[1])), Math.min(...corners.map(p => p[2]))],
    to: [Math.max(...corners.map(p => p[0])), Math.max(...corners.map(p => p[1])), Math.max(...corners.map(p => p[2]))]
  };
}
