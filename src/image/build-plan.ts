import schemaValid from "./schema-validator.generated.js";
import type { Blueprint } from '../blueprint/types.js';
import { MOBILE_LIMITS } from '../blueprint/types.js';
import { validateBlueprint } from '../blueprint/validator.js';
export const DETAIL_LIMITS = { FAST: 2000, BALANCED: 5000, DETAILED: 10000, ULTRA: 25000 } as const;
export type Detail = keyof typeof DETAIL_LIMITS;
export interface SourceImage { view: string; width: number; height: number }
export interface BuildPlan {
  schema_version: 1; plan_id: string; task_id: string; request_summary: string;
  source_images: SourceImage[]; detail: Detail; scale: number;
  target: { dimension: string; anchor: 'player-relative'; orientation: 'player-facing' };
  dimensions: Blueprint['size']; assumptions: string[]; open_choices: string[];
  palette: Record<string, string>; blueprint: Blueprint;
  steps: Array<{ id: string; dependencies: string[]; operation_count: number }>;
  estimates: { block_writes: number; snapshot_volume: number };
  validation: { validated: true }; persistence: { resumable: true };
  bounds: { from: [number, number, number]; to: [number, number, number] };
  conflict_policy: 'pause_on_conflict'; progress: { completed_batches: 0 };
  checkpoint: { next_batch: 0 }; plan_hash: string;
}
// Integrity checksum, not authentication. Session capability authenticates transport.
export function planHash(value: unknown): string {
  const canonical = (v: any): string => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k)+':'+canonical(v[k])).join(',') + '}' : JSON.stringify(v);
  const data = canonical(value); let h = 2166136261;
  for (let i=0;i<data.length;i++) h = Math.imul(h ^ data.charCodeAt(i),16777619);
  return (h>>>0).toString(16).padStart(8,'0');
}
export function sealPlan(plan: Omit<BuildPlan,'plan_hash'>): BuildPlan { return { ...plan, plan_hash: planHash(plan) }; }
export function validateBuildPlan(value: unknown): BuildPlan {
  if (!value || typeof value !== 'object' || JSON.stringify(value).length > 300000 || !schemaValid(value)) throw new Error('BuildPlan must be an object');
  const p = value as BuildPlan;
  const { plan_hash, ...unsigned } = p;
  if (plan_hash !== planHash(unsigned)) throw new Error('BuildPlan integrity check failed');
  if (p.schema_version !== 1 || !(p.detail in DETAIL_LIMITS) || !Number.isFinite(p.scale) || p.scale < .25 || p.scale > 4 || p.conflict_policy !== 'pause_on_conflict') throw new Error('Unsupported BuildPlan settings');
  if (!Array.isArray(p.source_images) || p.source_images.length < 1 || p.source_images.length > 3 || p.source_images.some(i => !Number.isInteger(i.width) || !Number.isInteger(i.height) || i.width < 1 || i.height < 1 || i.width > 1536 || i.height > 1536 || typeof i.view !== 'string' || i.view.length > 40)) throw new Error('Invalid image metadata');
  const result = validateBlueprint(p.blueprint, { ...MOBILE_LIMITS, maxEstimatedBlocks: DETAIL_LIMITS[p.detail], maxVolume: 100000 });
  if (!result.ok) throw new Error(result.errors.join('; '));
  const s=p.blueprint.size;
  if (JSON.stringify(p.dimensions)!==JSON.stringify(s) || p.estimates?.block_writes!==result.estimatedBlocks || p.estimates.snapshot_volume!==s.x*s.y*s.z) throw new Error('BuildPlan estimates do not match blueprint');
  if (p.target?.anchor !== 'player-relative' || p.target.orientation !== 'player-facing' || typeof p.target.dimension !== 'string') throw new Error('Invalid placement context');
  if (p.bounds.from.join(",")!=="0,0,0" || p.bounds.to.join(",")!==[s.x-1,s.y-1,s.z-1].join(",") || p.steps.length!==1 || p.steps[0]?.operation_count!==p.blueprint.operations.length || p.steps[0]?.dependencies.length!==0) throw new Error("Unsupported plan steps/bounds");
  if (p.progress?.completed_batches!==0 || p.checkpoint?.next_batch!==0) throw new Error('Imported plans must start at zero; recovery uses world storage');
  return p;
}
