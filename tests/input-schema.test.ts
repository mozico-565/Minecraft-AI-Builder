import test from 'node:test';import assert from 'node:assert/strict';
import { matchesInputSchema } from '../src/agent/input-schema.js';
test('closed tool input schemas reject unknown fields, missing parameters and coerced types',()=>{
 const schema={type:'object',required:['rotation'],additionalProperties:false,properties:{rotation:{oneOf:[{type:'integer',enum:[0,90,180,270]},{const:'facing'}]}}};
 assert.equal(matchesInputSchema({rotation:90},schema),true);assert.equal(matchesInputSchema({rotation:'facing'},schema),true);
 for(const v of [{rotation:'90'},{rotation:90,command:'kill @a'},{},null])assert.equal(matchesInputSchema(v,schema),false);
});
