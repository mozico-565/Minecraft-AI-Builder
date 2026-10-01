/** Only fixed codes and bounded numbers cross the public error boundary. */
export function visionFailure(error:unknown):{error:string;code:string;provider_status?:number;estimated_blocks?:number;block_limit?:number} {
 const result={error:'Vision generation or validation failed; check backend configuration and provider availability',code:'VISION_GENERATION_FAILED'};
 if(!(error instanceof Error))return result;
 const message=error.message;
 const http=/^Vision provider failed with HTTP (\d{3})$/.exec(message);
 if(http)return {...result,code:'VISION_PROVIDER_HTTP_ERROR',provider_status:Number(http[1])};
 const budget=/^Estimated block count (\d{1,8}) exceeds mobile limit (\d{1,8})(?:;|$)/.exec(message);
 if(budget)return {...result,code:'VISION_BLOCK_LIMIT',estimated_blocks:Number(budget[1]),block_limit:Number(budget[2])};
 if(message==='Vision provider connection failed or timed out')return {...result,code:'VISION_PROVIDER_TIMEOUT'};
 if(message==='Vision provider returned non-JSON content')return {...result,code:'VISION_RESPONSE_NOT_JSON'};
 if(message==='Blueprint does not match the supported JSON schema or exceeds input limits')return {...result,code:'VISION_BLUEPRINT_SCHEMA_INVALID'};
 if(message==='BuildPlan must be an object')return {...result,code:'VISION_BUILDPLAN_SCHEMA_INVALID'};
 if(/^Operation coordinate -?\d+,-?\d+,-?\d+ is outside declared size \d+x\d+x\d+(?:;|$)/.test(message))return {...result,code:'VISION_COORDINATES_INVALID'};
 if(['Invalid OpenRouter model configuration','Invalid OpenRouter output format','Invalid OpenRouter provider configuration','Unsupported Vision provider configuration'].includes(message))return {...result,code:'VISION_CONFIGURATION_INVALID'};
 return result;
}
