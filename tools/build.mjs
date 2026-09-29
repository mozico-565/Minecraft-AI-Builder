import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

const root = resolve(".");
const dist = resolve("dist");
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
  execFileSync("zip", ["-q", "-r", "-9", artifact, "."], { cwd: outputDir });
}

await import("./clean.mjs");
await mkdir(dist, { recursive: true });
await buildPack(`${root}/behavior_pack`, `${root}/src/main.ts`, `${dist}/android-pack`, "Minecraft-AI-Builder-Android.mcpack");
await buildPack(`${root}/server_behavior_pack`, `${root}/src/main-server.ts`, `${dist}/server-pack`, "Minecraft-AI-Builder-Server.mcpack");
await mkdir(`${dist}/backend`, { recursive: true });
await build({ entryPoints: [`${root}/backend/worker.ts`], outfile: `${dist}/backend/worker.mjs`, bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, logLevel: "info" });
await cp(`${root}/backend/wrangler.toml.example`, `${dist}/backend/wrangler.toml.example`);
await cp(`${root}/schemas/blueprint.schema.json`, `${dist}/blueprint.schema.json`);

for (const artifact of ["Minecraft-AI-Builder-Android.mcpack", "Minecraft-AI-Builder-Server.mcpack"]) {
  const bytes = (await readFile(`${dist}/${artifact}`)).length;
  console.log(`${artifact}: ${bytes} bytes`);
}
