import test from 'node:test';
import { build } from 'esbuild';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve,join } from 'node:path';
test('engine integration: build/undo, conflict atomicity, persisted resume conflict, owner, pause/cancel, invalid permutations/chunks',async()=>{
 const result=await build({entryPoints:['tests/support/engine-scenarios.ts'],bundle:true,write:false,format:'esm',platform:'node',alias:{'@minecraft/server':resolve('tests/support/minecraft-mock.ts')},external:['node:*']});
 const directory=await mkdtemp(join(tmpdir(),'aibuilder-engine-'));try{const file=join(directory,'engine.mjs');await writeFile(file,result.outputFiles![0]!.text);const module=await import(pathToFileURL(file).href);module.run();}finally{await rm(directory,{recursive:true,force:true});}
});

const extendedCases=['successfulRestart','pauseWorldConflict','finalVerification','pendingAndPermissions','unloadedMidBuild','failedPartialBatch','checkpointFailureOverlaps','arabicCheckpoint','worldEditRestartAndLegacyFingerprint'];
for(const scenario of extendedCases)test('engine '+scenario,async()=>{
 const result=await build({entryPoints:['tests/support/engine-scenarios.ts'],bundle:true,write:false,format:'esm',platform:'node',alias:{'@minecraft/server':resolve('tests/support/minecraft-mock.ts')},external:['node:*']});
 const directory=await mkdtemp(join(tmpdir(),'aibuilder-engine-'));try{const file=join(directory,'engine.mjs');await writeFile(file,result.outputFiles![0]!.text);const module=await import(pathToFileURL(file).href);module[scenario]();}finally{await rm(directory,{recursive:true,force:true});}
});
