import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";

import { resolve } from "node:path";
import { deflateSync, deflateRawSync } from "node:zlib";

const root = resolve(".");
const dist = resolve("dist");
const androidOnly = process.argv.includes("--android-only");
const externals = ["@minecraft/server", "@minecraft/server-ui", "@minecraft/server-net", "@minecraft/server-admin"];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function iconPng(size = 64) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); row[0] = 0;
    for (let x = 0; x < size; x++) {
      const edge = x < 4 || y < 4 || x >= size - 4 || y >= size - 4;
      const grid = (x > 13 && x < 50 && y > 13 && y < 50) && ((x % 12 < 3) || (y % 12 < 3));
      const [r, g, b] = edge ? [17, 94, 61] : grid ? [93, 214, 137] : [20, 29, 40];
      const offset = 1 + x * 4; row[offset] = r; row[offset + 1] = g; row[offset + 2] = b; row[offset + 3] = 255;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

async function buildPack(sourceDir, entry, outputDir, artifactName) {
  await mkdir(`${outputDir}/scripts`, { recursive: true });
  await cp(`${sourceDir}/manifest.json`, `${outputDir}/manifest.json`);
  await writeFile(`${outputDir}/pack_icon.png`, iconPng());
  await build({ entryPoints: [entry], outfile: `${outputDir}/scripts/main.js`, bundle: true, format: "esm", platform: "neutral", target: "es2020", external: externals, minify: true, sourcemap: false, logLevel: "info" });
  const artifact = `${dist}/${artifactName}`;
  await zipDirectory(outputDir,artifact);
}

if (!androidOnly) await import("./clean.mjs");
await mkdir(dist, { recursive: true });
await buildPack(`${root}/behavior_pack`, `${root}/src/main.ts`, `${dist}/android-pack`, "Minecraft-AI-Builder-Android.mcpack");
await cp(`${dist}/Minecraft-AI-Builder-Android.mcpack`, `${dist}/Minecraft-AI-Builder-Android-1.21.100.mcpack`);
if (!androidOnly) {
await buildPack(`${root}/server_behavior_pack`, `${root}/src/main-server.ts`, `${dist}/server-pack`, "Minecraft-AI-Builder-Server.mcpack");
await mkdir(`${dist}/backend`, { recursive: true });
await build({ entryPoints: [`${root}/backend/worker.ts`], outfile: `${dist}/backend/worker.mjs`, bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, logLevel: "info" });
// Packaged config is relative to dist/backend, not the source backend folder.
const deployConfig=(await readFile(`${root}/backend/wrangler.toml.example`,"utf8")).replace('main = "../dist/backend/worker.mjs"','main = "./worker.mjs"');
await writeFile(`${dist}/backend/wrangler.toml.example`,deployConfig);
await writeFile(`${dist}/backend/wrangler.toml`,deployConfig);
await cp(`${root}/schemas/blueprint.schema.json`, `${dist}/blueprint.schema.json`);
await cp(`${root}/schemas/build-plan.schema.json`, `${dist}/build-plan.schema.json`);
}

for (const artifact of ["Minecraft-AI-Builder-Android.mcpack", "Minecraft-AI-Builder-Android-1.21.100.mcpack", ...(!androidOnly ? ["Minecraft-AI-Builder-Server.mcpack"] : [])]) {
  const bytes = (await readFile(`${dist}/${artifact}`)).length;
  console.log(`${artifact}: ${bytes} bytes`);
}

async function zipDirectory(directory, destination) {
 const entries=[]; async function walk(dir,prefix=""){for(const item of await readdir(dir,{withFileTypes:true})){if(item.isDirectory())await walk(dir+"/"+item.name,prefix+item.name+"/");else entries.push({name:prefix+item.name,data:await readFile(dir+"/"+item.name)});}} await walk(directory);
 const files=[],central=[];let offset=0;
 for(const entry of entries){const name=Buffer.from(entry.name);const data=deflateRawSync(entry.data);const crc=crc32(entry.data);const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(entry.data.length,22);header.writeUInt16LE(name.length,26);
 const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt16LE(33,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(entry.data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);files.push(header,name,data);central.push(c,name);offset+=header.length+name.length+data.length;}
 const directoryData=Buffer.concat(central);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directoryData.length,12);end.writeUInt32LE(offset,16);await writeFile(destination,Buffer.concat([...files,directoryData,end]));
}
