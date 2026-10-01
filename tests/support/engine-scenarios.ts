import { planHash } from "../../src/image/build-plan.js";
import { makeBatches } from "../../src/builder/scheduler.js";
import assert from 'node:assert/strict';
import { BuildingEngine } from '../../src/builder/engine.js';
import { loadActiveJob,loadUndoHistory,saveActiveJob } from '../../src/storage/state.js';
import { reset,ticks,stopIntervals,player,dimension,BlockPermutation,faults } from './minecraft-mock.js';
const blueprint:any={version:1,name:'Engine fixture',size:{x:10,y:1,z:10},operations:[{type:'fill',from:[0,0,0],to:[9,0,9],block:'minecraft:stone'}]};
const options:any={origin:[0,70,0],rotation:0,conflictPolicy:'pause_on_conflict'};
export function run(){
 reset();let engine=new BuildingEngine();engine.start(player as any,blueprint,options);ticks(1);assert.equal(dimension.getBlock({x:0,y:70,z:0}).permutation.type.id,'minecraft:stone');finish(engine);assert.equal(engine.isBusy,false);engine.undo(player as any);assert.equal(dimension.getBlock({x:0,y:70,z:0}).isAir,true);
 reset();engine=new BuildingEngine();dimension.setBlockPermutation({x:0,y:70,z:0},BlockPermutation.resolve('minecraft:gold_block'));engine.start(player as any,blueprint,options);ticks(1);assert.match(engine.statusText(),/paused/);assert.equal(dimension.getBlock({x:1,y:70,z:0}).isAir,true);dimension.setBlockPermutation({x:0,y:70,z:0},BlockPermutation.resolve('minecraft:air'));engine.resume(player as any);finish(engine);assert.equal(engine.isBusy,false);
 reset();engine=new BuildingEngine();const two:any={...blueprint,size:{x:20,y:1,z:20},operations:[{type:'fill',from:[0,0,0],to:[19,0,19],block:'minecraft:stone'}]};engine.start(player as any,two,options);ticks(1);assert.ok(loadActiveJob()!.batchIndex>0);stopIntervals();engine=new BuildingEngine();engine.restorePersisted(player as any);dimension.setBlockPermutation({x:0,y:70,z:0},BlockPermutation.resolve('minecraft:gold_block'));ticks(1);assert.match(engine.statusText(),/paused/);assert.equal(dimension.getBlock({x:0,y:70,z:19}).isAir,true);
 reset();engine=new BuildingEngine();engine.start(player as any,two,options);assert.equal(engine.cancel({...player,id:'intruder'} as any),false);engine.pause(player as any);ticks(1);assert.equal(dimension.getBlock({x:0,y:70,z:0}).isAir,true);engine.resume(player as any);ticks(1);engine.cancel(player as any);assert.equal(engine.isBusy,false);engine.undo(player as any);assert.equal(dimension.getBlock({x:0,y:70,z:0}).isAir,true);
 reset();engine=new BuildingEngine();assert.throws(()=>engine.start(player as any,{...blueprint,operations:[{...blueprint.operations[0],states:{invalid_state:true}}]},options));assert.equal(engine.isBusy,false);dimension.loaded=false;assert.throws(()=>engine.start(player as any,blueprint,options));
}

function finish(engine:BuildingEngine){for(let n=0;n<100&&engine.isBusy;n++)ticks(1);assert.equal(engine.isBusy,false,"Engine must finish bounded verification");}

export function successfulRestart(){
 reset();let e=new BuildingEngine();e.start(player as any,{...blueprint,size:{x:20,y:1,z:20},operations:[{type:'fill',from:[0,0,0],to:[19,0,19],block:'minecraft:stone'}]}, {...options,blocksPerTick:64});ticks(2);const before=loadActiveJob()!;assert.equal(before.batchIndex,2);stopIntervals();e=new BuildingEngine();e.restorePersisted(player as any);e.resume(player as any);finish(e);assert.equal(dimension.getBlock({x:19,y:70,z:19}).permutation.type.id,'minecraft:stone');e.undo(player as any);assert.equal(dimension.getBlock({x:19,y:70,z:19}).isAir,true);
}
export function pauseWorldConflict(){
 reset();const e=new BuildingEngine();e.start(player as any,{...blueprint,size:{x:20,y:1,z:20},operations:[{type:'fill',from:[0,0,0],to:[19,0,19],block:'minecraft:stone'}]},options);ticks(1);e.pause(player as any);dimension.setBlockPermutation({x:0,y:70,z:0},BlockPermutation.resolve('minecraft:gold_block'));e.resume(player as any);ticks(1);assert.match(e.statusText(),/paused/);assert.equal(loadActiveJob()!.batchIndex,1);
}
export function finalVerification(){
 reset();const e=new BuildingEngine();e.start(player as any,blueprint,options);ticks(1);dimension.setBlockPermutation({x:0,y:70,z:0},BlockPermutation.resolve('minecraft:gold_block'));ticks(2);assert.match(e.statusText(),/paused/);assert.equal(e.isBusy,true);assert.ok(player.messages.some(s=>s.includes('PAUSED_CONFLICT')));
}
export function pendingAndPermissions(){
 reset();let e=new BuildingEngine();e.start(player as any,blueprint,options);stopIntervals();e=new BuildingEngine();assert.throws(()=>e.start(player as any,blueprint,options),/unfinished/);assert.throws(()=>e.discardPersisted({...player,id:'intruder'} as any),/belongs/);assert.throws(()=>e.restorePersisted({...player,id:'intruder'} as any),/belongs/);assert.equal(e.hasPersistedJob({...player,id:'intruder'} as any),false);e.restorePersisted(player as any);e.cancel(player as any);
}
export function unloadedMidBuild(){
 reset();const e=new BuildingEngine();e.start(player as any,blueprint,options);dimension.loaded=false;ticks(1);assert.match(e.statusText(),/paused/);assert.equal(loadActiveJob()!.batchIndex,0);dimension.loaded=true;assert.equal(dimension.getBlock({x:0,y:70,z:0}).isAir,true);e.resume(player as any);finish(e);
}
export function failedPartialBatch(){
 reset();let e=new BuildingEngine();e.start(player as any,blueprint,options);faults.fillAfter=3;ticks(1);assert.match(e.statusText(),/paused/);const saved=loadActiveJob()!;assert.equal(saved.batchIndex,0);assert.equal(saved.pendingBatch,0);const snapshot=saved.undoId;stopIntervals();e=new BuildingEngine();e.restorePersisted(player as any);e.resume(player as any);finish(e);assert.equal(dimension.getBlock({x:9,y:70,z:9}).permutation.type.id,'minecraft:stone');assert.equal(loadUndoHistory().slice(-1)[0]?.id,snapshot);e.undo(player as any);assert.equal(dimension.getBlock({x:0,y:70,z:0}).isAir,true);
}
export function checkpointFailureOverlaps(){
 reset();let e=new BuildingEngine();const overlapping:any={version:1,name:'Overlap',size:{x:2,y:1,z:2},operations:[{type:'fill',from:[0,0,0],to:[1,0,1],block:'minecraft:stone'},{type:'set_block',at:[0,0,0],block:'minecraft:gold_block'}]};e.start(player as any,overlapping,options);ticks(1);faults.propertyWrites=1;assert.doesNotThrow(()=>ticks(1));assert.match(e.statusText(),/paused/);faults.propertyWrites=undefined;const saved=loadActiveJob()!;assert.equal(saved.batchIndex,1);assert.equal(saved.pendingBatch,1);assert.equal(dimension.getBlock({x:0,y:70,z:0}).permutation.type.id,'minecraft:gold_block');stopIntervals();e=new BuildingEngine();e.restorePersisted(player as any);e.resume(player as any);finish(e);assert.equal(dimension.getBlock({x:0,y:70,z:0}).permutation.type.id,'minecraft:gold_block');
}
export function arabicCheckpoint(){
 reset();const e=new BuildingEngine();const arabic:any={...blueprint,name:'بيت عربي',description:'ع'.repeat(400),operations:Array.from({length:512},()=>({type:'set_block',at:[0,0,0],block:'minecraft:stone',states:{text:'ع'.repeat(40)}}))};e.start(player as any,arabic,options);assert.equal(loadActiveJob()!.blueprint?.name,'بيت عربي');e.cancel(player as any);
}

export function worldEditRestartAndLegacyFingerprint(){
 reset();let e=new BuildingEngine();const batches=makeBatches([{kind:'box',from:[0,70,0],to:[19,70,19],block:'minecraft:stone'}]).map(batch=>({...batch,replaceTypes:undefined}));
 e.startWorldEdit(player as any,{label:'Fill recovery',actionType:'fill',bounds:{from:[0,70,0],to:[19,70,19]},batches});ticks(1);const saved=loadActiveJob()!;assert.equal(saved.kind,'world_edit');assert.equal(saved.batchIndex,1);
 // Simulate a real v17e0972 checkpoint whose fingerprint included undefined fields.
 saveActiveJob({...saved,fingerprint:planHash(batches)});stopIntervals();e=new BuildingEngine();assert.doesNotThrow(()=>e.restorePersisted(player as any));e.resume(player as any);finish(e);assert.equal(dimension.getBlock({x:19,y:70,z:19}).permutation.type.id,'minecraft:stone');e.undo(player as any);assert.equal(dimension.getBlock({x:19,y:70,z:19}).isAir,true);
}
