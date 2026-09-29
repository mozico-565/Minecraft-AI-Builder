import { compileBlueprint, primitiveVolume } from "./compiler.js";
import { isBlockIdentifier, SAFE_BLOCK_SET } from "./blocks.js";
import type { Blueprint, Operation, ValidationLimits, ValidationResult } from "./types.js";
import { MOBILE_LIMITS } from "./types.js";

function collectBlocks(operation: Operation, result: string[]): void {
  if ("block" in operation) result.push(operation.block);
  if (operation.type === "repeat" || operation.type === "mirror") collectBlocks(operation.operation, result);
}

export function validateBlueprint(
  value: unknown,
  limits: ValidationLimits = MOBILE_LIMITS,
  blockExists: (id: string) => boolean = id => SAFE_BLOCK_SET.has(id)
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let estimatedBlocks = 0;
  let expandedOperations = 0;
  const blueprint = value as Partial<Blueprint>;

  if (!value || typeof value !== "object" || Array.isArray(value)) errors.push("Blueprint must be an object");
  if (blueprint.version !== 1) errors.push("Only Blueprint version 1 is supported");
  if (typeof blueprint.name !== "string" || blueprint.name.trim().length === 0 || blueprint.name.length > 80) errors.push("Blueprint name must be 1-80 characters");
  if (!blueprint.size || !Number.isInteger(blueprint.size.x) || !Number.isInteger(blueprint.size.y) || !Number.isInteger(blueprint.size.z)) {
    errors.push("Blueprint size must contain integer x, y and z values");
  } else {
    const { x, y, z } = blueprint.size;
    if (x < 1 || y < 1 || z < 1 || x > limits.maxAxis || y > limits.maxAxis || z > limits.maxAxis) errors.push(`Each size axis must be between 1 and ${limits.maxAxis}`);
    if (x * y * z > limits.maxVolume) errors.push("Blueprint bounding volume is too large");
  }
  if (!Array.isArray(blueprint.operations) || blueprint.operations.length === 0) errors.push("Blueprint must contain operations");
  if (errors.length) return { ok: false, errors, warnings, estimatedBlocks, expandedOperations, tier: "unsafe" };

  const full = blueprint as Blueprint;
  const blocks: string[] = [];
  for (const operation of full.operations) collectBlocks(operation, blocks);
  for (const list of Object.values(full.components ?? {})) for (const operation of list) collectBlocks(operation, blocks);
  for (const raw of blocks) {
    const id = raw.startsWith("$") ? full.palette?.[raw.slice(1)] : raw;
    if (!id) errors.push(`Unknown palette reference: ${raw}`);
    else if (!isBlockIdentifier(id)) errors.push(`Invalid block identifier: ${id}`);
    else if (!blockExists(id)) errors.push(`Unsupported or unknown block: ${id}`);
  }

  try {
    const primitives = compileBlueprint(full);
    expandedOperations = primitives.length;
    estimatedBlocks = primitives.reduce((total, operation) => total + primitiveVolume(operation), 0);
    for (const primitive of primitives) {
      const points = primitive.kind === "set" ? [primitive.at] : [primitive.from, primitive.to];
      for (const point of points) {
        if (point[0] < 0 || point[1] < 0 || point[2] < 0 || point[0] >= full.size.x || point[1] >= full.size.y || point[2] >= full.size.z) {
          errors.push(`Operation coordinate ${point.join(",")} is outside declared size ${full.size.x}x${full.size.y}x${full.size.z}`);
          break;
        }
      }
      if (errors.length > 20) break;
    }
    if (expandedOperations > limits.maxExpandedOperations) errors.push(`Expanded operation count ${expandedOperations} exceeds ${limits.maxExpandedOperations}`);
    if (estimatedBlocks > limits.maxEstimatedBlocks) errors.push(`Estimated block count ${estimatedBlocks} exceeds mobile limit ${limits.maxEstimatedBlocks}`);
    else if (estimatedBlocks > limits.warningBlocks) warnings.push(`Large build: approximately ${estimatedBlocks} block writes`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const tier = estimatedBlocks <= 2_000 ? "small" : estimatedBlocks <= 10_000 ? "medium" : estimatedBlocks <= limits.maxEstimatedBlocks ? "large" : "unsafe";
  return { ok: errors.length === 0, errors, warnings, estimatedBlocks, expandedOperations, tier };
}
