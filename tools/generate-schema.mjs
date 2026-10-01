import Ajv from 'ajv/dist/2020.js';
import standalone from 'ajv/dist/standalone/index.js';
import { readFile, writeFile } from 'node:fs/promises';
const ajv = new Ajv({ code: { source: true, esm: true }, strict: false, allErrors: false });
const validate = ajv.compile(JSON.parse(await readFile('schemas/blueprint.schema.json','utf8')));
await writeFile('src/blueprint/schema-validator.generated.js', standalone(ajv, validate).replace(/require\("ajv\/dist\/runtime\/ucs2length"\).default/g, '(value => [...value].length)'));
await writeFile('src/blueprint/schema-validator.generated.d.ts', 'export default function validate(value: unknown): boolean;\n');

const plan = ajv.compile(JSON.parse(await readFile('schemas/build-plan.schema.json','utf8')));
await writeFile('src/image/schema-validator.generated.js', standalone(ajv, plan).replace(/require\("ajv\/dist\/runtime\/ucs2length"\).default/g, '(value => [...value].length)'));
await writeFile('src/image/schema-validator.generated.d.ts', 'export default function validate(value: unknown): boolean;\n');
