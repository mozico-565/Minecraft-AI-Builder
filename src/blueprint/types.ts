export type Vec3Tuple = [number, number, number];
export type BlockStates = Record<string, string | number | boolean>;
export type BlockRef = string;

export interface Size3 { x: number; y: number; z: number }

interface BlockOperation {
  block: BlockRef;
  states?: BlockStates;
}

export type Operation =
  | ({ type: "set_block"; at: Vec3Tuple } & BlockOperation)
  | ({ type: "fill" | "floor"; from: Vec3Tuple; to: Vec3Tuple } & BlockOperation)
  | ({ type: "hollow_box" | "walls"; from: Vec3Tuple; to: Vec3Tuple; thickness?: number } & BlockOperation)
  | ({ type: "line"; from: Vec3Tuple; to: Vec3Tuple } & BlockOperation)
  | ({ type: "column"; at: Vec3Tuple; height: number } & BlockOperation)
  | ({ type: "roof"; from: Vec3Tuple; to: Vec3Tuple; style?: "flat" | "gable_x" | "gable_z" } & BlockOperation)
  | ({ type: "door" | "window"; at: Vec3Tuple; width: number; height: number; axis?: "x" | "z" } & BlockOperation)
  | { type: "component"; component: string; at: Vec3Tuple }
  | { type: "repeat"; count: number; step: Vec3Tuple; operation: Operation }
  | { type: "mirror"; axis: "x" | "z"; pivot: number; includeOriginal?: boolean; operation: Operation };

export interface Blueprint {
  version: 1;
  name: string;
  description?: string;
  size: Size3;
  palette?: Record<string, string>;
  components?: Record<string, Operation[]>;
  operations: Operation[];
}

export interface ValidationLimits {
  maxAxis: number;
  maxVolume: number;
  maxEstimatedBlocks: number;
  maxExpandedOperations: number;
  warningBlocks: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  estimatedBlocks: number;
  expandedOperations: number;
  tier: "small" | "medium" | "large" | "unsafe";
}

export const MOBILE_LIMITS: ValidationLimits = {
  maxAxis: 128,
  maxVolume: 128 * 128 * 128,
  maxEstimatedBlocks: 25_000,
  maxExpandedOperations: 4_096,
  warningBlocks: 10_000
};
