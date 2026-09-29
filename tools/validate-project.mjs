import Ajv2020 from "ajv/dist/2020.js";
import { readdir, readFile } from "node:fs/promises";

const json = async path => JSON.parse(await readFile(path, "utf8"));
const schema = await json("schemas/blueprint.schema.json");
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

for (const name of await readdir("examples")) {
  if (!name.endsWith(".json")) continue;
  const value = await json(`examples/${name}`);
  if (!validate(value)) throw new Error(`${name}: ${ajv.errorsText(validate.errors, { separator: "\n" })}`);
}

for (const path of ["behavior_pack/manifest.json", "server_behavior_pack/manifest.json"]) {
  const manifest = await json(path);
  if (manifest.format_version !== 2) throw new Error(`${path}: stable pack manifest format must be 2`);
  if (!Array.isArray(manifest.header?.version) || manifest.header.version.join(".") !== "0.1.0") throw new Error(`${path}: invalid version`);
  if (!manifest.modules?.some(module => module.type === "script" && module.entry === "scripts/main.js")) throw new Error(`${path}: missing script entry`);
  const uuids = [manifest.header.uuid, ...manifest.modules.map(module => module.uuid)].filter(Boolean);
  if (new Set(uuids).size !== uuids.length) throw new Error(`${path}: duplicate UUID`);
}

console.log("Schemas, examples, and manifests are valid.");
