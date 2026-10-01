import Ajv2020 from "ajv/dist/2020.js";
import { readdir, readFile } from "node:fs/promises";

const json = async path => JSON.parse(await readFile(path, "utf8"));
const schema = await json("schemas/blueprint.schema.json");
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);
ajv.compile(await json("schemas/build-plan.schema.json"));

for (const name of await readdir("examples")) {
  if (!name.endsWith(".json")) continue;
  const value = await json(`examples/${name}`);
  if (!validate(value)) throw new Error(`${name}: ${ajv.errorsText(validate.errors, { separator: "\n" })}`);
}

for (const path of ["behavior_pack/manifest.json", "server_behavior_pack/manifest.json"]) {
  const manifest = await json(path);
  if (manifest.format_version !== 2) throw new Error(`${path}: stable pack manifest format must be 2`);
  if (!Array.isArray(manifest.header?.version) || manifest.header.version.length !== 3 || !manifest.header.version.every(n => Number.isInteger(n) && n >= 0)) throw new Error(`${path}: invalid version`);
  if (manifest.modules.some(module => module.version.join(".") !== manifest.header.version.join("."))) throw new Error(`${path}: module/header version mismatch`);
  if (!manifest.modules?.some(module => module.type === "script" && module.entry === "scripts/main.js")) throw new Error(`${path}: missing script entry`);
  const uuids = [manifest.header.uuid, ...manifest.modules.map(module => module.uuid)].filter(Boolean);
  if (new Set(uuids).size !== uuids.length) throw new Error(`${path}: duplicate UUID`);
}

const android = await json("behavior_pack/manifest.json");
if (android.header.min_engine_version.join(".") !== "1.21.100") throw new Error("Android engine must target 1.21.100");
const androidDeps = Object.fromEntries(android.dependencies.map(d => [d.module_name, d.version]));
if (android.dependencies.length !== 2 || androidDeps["@minecraft/server"] !== "2.1.0" || androidDeps["@minecraft/server-ui"] !== "2.0.0") throw new Error("Android dependencies must use the stable APIs available in 1.21.100");

console.log("Schemas, examples, and manifests are valid.");
