// Closed subset used by the registry's own trusted schemas; semantic checks run next.
export function matchesInputSchema(value:unknown,schema:Record<string,any>):boolean {
 if(schema.oneOf)return schema.oneOf.filter((s:any)=>matchesInputSchema(value,s)).length===1;
 if('const' in schema && value!==schema.const)return false;
 if(schema.enum && !schema.enum.includes(value))return false;
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;const v=value as Record<string,unknown>;
  if(schema.required?.some((k:string)=>!(k in v)))return false;
  if(schema.additionalProperties===false&&Object.keys(v).some(k=>!Object.prototype.hasOwnProperty.call(schema.properties??{},k)))return false;
  return Object.entries(schema.properties??{}).every(([k,s])=>!(k in v)||matchesInputSchema(v[k],s as any));
 }
 if(schema.type==='array')return Array.isArray(value)&&value.length>=(schema.minItems??0)&&value.length<=(schema.maxItems??Infinity)&&value.every(v=>matchesInputSchema(v,schema.items));
 if(schema.type==='string')return typeof value==='string'&&value.length>=(schema.minLength??0)&&value.length<=(schema.maxLength??Infinity)&&(!schema.pattern||new RegExp(schema.pattern).test(value));
 if(schema.type==='integer'||schema.type==='number')return typeof value==='number'&&Number.isFinite(value)&&(schema.type!=='integer'||Number.isInteger(value))&&value>=(schema.minimum??-Infinity)&&value<=(schema.maximum??Infinity);
 if(schema.type==='boolean')return typeof value==='boolean';
 return schema.type===undefined;
}
