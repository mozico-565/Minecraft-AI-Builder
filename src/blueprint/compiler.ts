import type { Blueprint, BlockStates, Operation, Vec3Tuple } from "./types.js";
import { addVec, mirrorOperation, offsetOperation } from "./transform.js";

export interface BoxPrimitive {
  kind: "box";
  from: Vec3Tuple;
  to: Vec3Tuple;
  block: string;
  states?: BlockStates;
}

export interface SetPrimitive {
  kind: "set";
  at: Vec3Tuple;
  block: string;
  states?: BlockStates;
}

export type Primitive = BoxPrimitive | SetPrimitive;

function normalizeBox(a: Vec3Tuple, b: Vec3Tuple): [Vec3Tuple, Vec3Tuple] {
  return [
    [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
    [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]
  ];
}

function resolveBlock(block: string, blueprint: Blueprint): string {
  if (!block.startsWith("$")) return block;
  const resolved = blueprint.palette?.[block.slice(1)];
  if (!resolved) throw new Error(`Unknown palette reference: ${block}`);
  return resolved;
}

function box(from: Vec3Tuple, to: Vec3Tuple, block: string, states?: BlockStates): BoxPrimitive {
  const [low, high] = normalizeBox(from, to);
  return { kind: "box", from: low, to: high, block, states };
}

function linePoints(from: Vec3Tuple, to: Vec3Tuple): Vec3Tuple[] {
  const dx = to[0] - from[0]; const dy = to[1] - from[1]; const dz = to[2] - from[2];
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  if (steps === 0) return [[...from]];
  const points: Vec3Tuple[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= steps; i++) {
    const p: Vec3Tuple = [
      Math.round(from[0] + dx * i / steps),
      Math.round(from[1] + dy * i / steps),
      Math.round(from[2] + dz * i / steps)
    ];
    const key = p.join(",");
    if (!seen.has(key)) { seen.add(key); points.push(p); }
  }
  return points;
}

function compileOne(operation: Operation, blueprint: Blueprint, depth: number): Primitive[] {
  if (depth > 12) throw new Error("Operation nesting exceeds 12 levels");
  if (operation.type === "repeat") {
    const result: Primitive[] = [];
    for (let i = 0; i < operation.count; i++) {
      result.push(...compileOne(offsetOperation(operation.operation, [operation.step[0] * i, operation.step[1] * i, operation.step[2] * i]), blueprint, depth + 1));
    }
    return result;
  }
  if (operation.type === "mirror") {
    const result = operation.includeOriginal === false ? [] : compileOne(operation.operation, blueprint, depth + 1);
    return result.concat(compileOne(mirrorOperation(operation.operation, operation.axis, operation.pivot), blueprint, depth + 1));
  }
  if (operation.type === "component") {
    const component = blueprint.components?.[operation.component];
    if (!component) throw new Error(`Unknown component: ${operation.component}`);
    return component.flatMap(child => compileOne(offsetOperation(child, operation.at), blueprint, depth + 1));
  }

  const block = resolveBlock(operation.block, blueprint);
  const states = operation.states;
  switch (operation.type) {
    case "set_block":
      return [{ kind: "set", at: operation.at, block, states }];
    case "fill": case "floor":
      return [box(operation.from, operation.to, block, states)];
    case "column":
      return [box(operation.at, addVec(operation.at, [0, operation.height - 1, 0]), block, states)];
    case "line":
      return linePoints(operation.from, operation.to).map(at => ({ kind: "set" as const, at, block, states }));
    case "walls": case "hollow_box": {
      const [a, b] = normalizeBox(operation.from, operation.to);
      const t = Math.max(1, operation.thickness ?? 1);
      const parts: Primitive[] = [
        box(a, [Math.min(b[0], a[0] + t - 1), b[1], b[2]], block, states),
        box([Math.max(a[0], b[0] - t + 1), a[1], a[2]], b, block, states),
        box([a[0] + t, a[1], a[2]], [b[0] - t, b[1], Math.min(b[2], a[2] + t - 1)], block, states),
        box([a[0] + t, a[1], Math.max(a[2], b[2] - t + 1)], [b[0] - t, b[1], b[2]], block, states)
      ].filter(p => p.kind !== "box" || (p.from[0] <= p.to[0] && p.from[2] <= p.to[2]));
      if (operation.type === "hollow_box") {
        parts.push(box([a[0] + t, a[1], a[2] + t], [b[0] - t, Math.min(b[1], a[1] + t - 1), b[2] - t], block, states));
        parts.push(box([a[0] + t, Math.max(a[1], b[1] - t + 1), a[2] + t], [b[0] - t, b[1], b[2] - t], block, states));
      }
      return parts.filter(p => p.kind !== "box" || (p.from[0] <= p.to[0] && p.from[1] <= p.to[1] && p.from[2] <= p.to[2]));
    }
    case "door": case "window": {
      const end: Vec3Tuple = operation.axis === "z"
        ? [operation.at[0], operation.at[1] + operation.height - 1, operation.at[2] + operation.width - 1]
        : [operation.at[0] + operation.width - 1, operation.at[1] + operation.height - 1, operation.at[2]];
      return [box(operation.at, end, block, states)];
    }
    case "roof": {
      const [a, b] = normalizeBox(operation.from, operation.to);
      if (!operation.style || operation.style === "flat") return [box(a, b, block, states)];
      const alongX = operation.style === "gable_x";
      const span = alongX ? b[2] - a[2] + 1 : b[0] - a[0] + 1;
      const layers = Math.ceil(span / 2);
      const result: Primitive[] = [];
      for (let i = 0; i < layers; i++) {
        const from: Vec3Tuple = alongX ? [a[0], a[1] + i, a[2] + i] : [a[0] + i, a[1] + i, a[2]];
        const to: Vec3Tuple = alongX ? [b[0], a[1] + i, b[2] - i] : [b[0] - i, a[1] + i, b[2]];
        result.push(box(from, to, block, states));
      }
      return result;
    }
  }
}

export function compileBlueprint(blueprint: Blueprint): Primitive[] {
  return blueprint.operations.flatMap(operation => compileOne(operation, blueprint, 0));
}

export function primitiveVolume(primitive: Primitive): number {
  if (primitive.kind === "set") return 1;
  return (primitive.to[0] - primitive.from[0] + 1) * (primitive.to[1] - primitive.from[1] + 1) * (primitive.to[2] - primitive.from[2] + 1);
}
