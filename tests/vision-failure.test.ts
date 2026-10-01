import test from 'node:test';
import assert from 'node:assert/strict';
import {visionFailure} from '../backend/vision-failure.js';

test('Vision failures expose only fixed codes and bounded provider/budget numbers',()=>{
 assert.equal(visionFailure(new Error('Vision provider returned non-JSON content')).code,'VISION_RESPONSE_NOT_JSON');
 assert.equal(visionFailure(new Error('Blueprint does not match the supported JSON schema or exceeds input limits')).code,'VISION_BLUEPRINT_SCHEMA_INVALID');
 assert.equal(visionFailure(new Error('Operation coordinate 40,1,0 is outside declared size 40x6x8')).code,'VISION_COORDINATES_INVALID');
 assert.equal(visionFailure(new Error('Vision provider failed with HTTP 402')).provider_status,402);
 const budget=visionFailure(new Error('Estimated block count 5168 exceeds mobile limit 5000'));
 assert.equal(budget.estimated_blocks,5168);assert.equal(budget.block_limit,5000);
});

test('Unknown/upstream errors and forged suffixes cannot disclose credentials',()=>{
 const marker='SERVER_SECRET_DO_NOT_DISCLOSE';
 for(const error of [new Error(marker),new Error('Bearer '+marker),new Error('Vision provider failed with HTTP 402 '+marker),new Error('Invalid block identifier: '+marker),{message:marker}]){
  const result=visionFailure(error);assert.equal(result.code,'VISION_GENERATION_FAILED');assert.doesNotMatch(JSON.stringify(result),new RegExp(marker));
 }
});
