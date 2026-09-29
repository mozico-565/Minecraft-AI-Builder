import type { Blueprint } from "../blueprint/types.js";

export interface PlannerContext {
  locale: "ar" | "en";
  maxBlocks: number;
  maxSize: { x: number; y: number; z: number };
}

export interface Planner {
  readonly available: boolean;
  readonly unavailableReason?: string;
  generate(prompt: string, context: PlannerContext): Promise<Blueprint>;
}
