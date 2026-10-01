/** Server-only OpenRouter transport. No model fallback or synthetic output. */
import blueprintSchema from '../schemas/blueprint.schema.json' with {type:'json'};
import { OpenAICompatibleVisionProvider, type VisionEnv, type VisionProvider, type VisionRequest } from './vision.js';
export const DEFAULT_OPENROUTER_MODEL='minimax/minimax-m3';
// Blueprint's local #/$defs refs must resolve at the new envelope root.
const {$schema,$id,$defs,...blueprint}=blueprintSchema;
export const VISION_ANALYSIS_SCHEMA={type:'object',additionalProperties:false,required:['blueprint','assumptions','open_choices'],properties:{blueprint,assumptions:{type:'array',maxItems:20,items:{type:'string',maxLength:300}},open_choices:{type:'array',maxItems:20,items:{type:'string',maxLength:300}}},$defs};
// Runtime-tested grammar compatibility only. The original Blueprint/BuildPlan
// schemas remain authoritative after generation. All current oneOf branches
// have disjoint types/patterns, so anyOf preserves their supported variants.
function grammarSchema(value:unknown):unknown {
 if(Array.isArray(value))return value.map(grammarSchema);
 if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='propertyNames').map(([key,v])=>[key==='oneOf'?'anyOf':key,grammarSchema(v)]));
 return value;
}
export const VISION_PROVIDER_SCHEMA=grammarSchema(VISION_ANALYSIS_SCHEMA);
export class OpenRouterVisionProvider implements VisionProvider {
 constructor(private env:VisionEnv) {}
 async generate(request:VisionRequest){
  if(!this.env.OPENROUTER_API_KEY)throw new Error('OpenRouter Vision is not configured');
  const model=this.env.OPENROUTER_MODEL??DEFAULT_OPENROUTER_MODEL;
  if(!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.:-]+$/.test(model))throw new Error('Invalid OpenRouter model configuration');
  const format=this.env.OPENROUTER_OUTPUT_FORMAT??'json_schema';
  if(!['json_schema','json_object'].includes(format))throw new Error('Invalid OpenRouter output format');
  const endpoint=this.env.OPENROUTER_PROVIDER;
  if(endpoint && (endpoint.length>80 || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?$/.test(endpoint)))throw new Error('Invalid OpenRouter provider configuration');
  const response_format=format==='json_schema'?{type:'json_schema',json_schema:{name:'minecraft_vision_analysis',strict:true,schema:VISION_PROVIDER_SCHEMA}}:{type:'json_object'};
  const provider={require_parameters:true,...(endpoint?{only:[endpoint],allow_fallbacks:false}:{})};
  const adapter=new OpenAICompatibleVisionProvider({AI_API_KEY:this.env.OPENROUTER_API_KEY,AI_BASE_URL:'https://openrouter.ai/api/v1',AI_VISION_MODEL:model},{response_format,provider,reasoning:{enabled:false}});
  return adapter.generate(request);
 }
}
export function visionProviderName(env:VisionEnv):string{return env.VISION_PROVIDER??(env.OPENROUTER_API_KEY?'openrouter':'compatible');}
export function visionConfigured(env:VisionEnv):boolean{
 const name=visionProviderName(env);return name==='openrouter'?Boolean(env.OPENROUTER_API_KEY):name==='compatible'&&Boolean(env.AI_API_KEY&&env.AI_VISION_MODEL);
}
export function createVisionProvider(env:VisionEnv):VisionProvider{
 const name=visionProviderName(env);if(name==='openrouter')return new OpenRouterVisionProvider(env);if(name==='compatible')return new OpenAICompatibleVisionProvider(env);throw new Error('Unsupported Vision provider configuration');
}

export function visionEnvFrom(source:Record<string,string|undefined>):VisionEnv {
 return {VISION_PROVIDER:source.VISION_PROVIDER,OPENROUTER_API_KEY:source.OPENROUTER_API_KEY,OPENROUTER_MODEL:source.OPENROUTER_MODEL,OPENROUTER_OUTPUT_FORMAT:source.OPENROUTER_OUTPUT_FORMAT,OPENROUTER_PROVIDER:source.OPENROUTER_PROVIDER,AI_API_KEY:source.AI_API_KEY,AI_BASE_URL:source.AI_BASE_URL,AI_VISION_MODEL:source.AI_VISION_MODEL,AI_VISION_REASONING_EFFORT:source.AI_VISION_REASONING_EFFORT,AI_VISION_REASONING_FORMAT:source.AI_VISION_REASONING_FORMAT};
}
