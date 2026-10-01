import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import ts from 'typescript';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const nativeModules = ['@minecraft/server', '@minecraft/server-ui'];
const oldTypes = ['minecraft-server-1-21-100', 'minecraft-server-ui-1-21-100'];
async function runtimeExports(packageName: string): Promise<Set<string>> {
  const source = ts.createSourceFile('index.d.ts', await readFile(`node_modules/${packageName}/index.d.ts`, 'utf8'), ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if ((ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement) || ts.isFunctionDeclaration(statement)) && statement.name) names.add(statement.name.text);
    if (ts.isVariableStatement(statement)) for (const d of statement.declarationList.declarations) if (ts.isIdentifier(d.name)) names.add(d.name.text);
  }
  return names;
}
async function checkNativeImports(code: string) {
  const exports = await Promise.all(oldTypes.map(runtimeExports));
  const source = ts.createSourceFile('main.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const seen = new Set<string>();
  for (const statement of source.statements) if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    const name = statement.moduleSpecifier.text; seen.add(name);
    const index = nativeModules.indexOf(name);
    assert.notEqual(index, -1, `Android must not import ${name}`);
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const entry of bindings.elements) assert.ok(exports[index]!.has((entry.propertyName ?? entry.name).text), `Unavailable named import: ${entry.getText()}`);
    assert.equal(statement.importClause?.name, undefined, 'No native default imports');
  }
  assert.deepEqual([...seen].sort(), [...nativeModules].sort());
}

test('Android manifest upgrades the existing UUID using only 1.21.100 stable dependencies', async () => {
  const m = JSON.parse(await readFile('behavior_pack/manifest.json', 'utf8'));
  assert.deepEqual(m.header.min_engine_version, [1, 21, 100]);
  assert.deepEqual(m.header.version, [0, 1, 1]);
  assert.equal(m.header.uuid, '5b0fdff4-8d7a-4e47-9650-2d77b1fc2cc1');
  assert.deepEqual(m.modules[0].version, m.header.version);
  assert.deepEqual(m.dependencies, [{ module_name: '@minecraft/server', version: '2.1.0' }, { module_name: '@minecraft/server-ui', version: '2.0.0' }]);
});

test('Bundled Android entry links and starts with old stable exports; menu/compass/spawn work', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'aibuilder-android-'));
  try {
    const result = await build({ entryPoints: ['src/main.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2020', minify: true, external: nativeModules });
    const code = result.outputFiles![0]!.text;
    await checkNativeImports(code);
    await writeFile(join(temp, 'main.mjs'), code);
    for (const [index, fixture] of ['bedrock-1-21-100', 'bedrock-ui-2-0'].entries()) {
      const directory = join(temp, 'node_modules', nativeModules[index]!);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module', exports: './index.mjs' }));
      await build({ entryPoints: [`tests/support/${fixture}.ts`], bundle: true, format: 'esm', platform: 'node', outfile: join(directory, 'index.mjs') });
    }
    await import(pathToFileURL(join(temp, 'main.mjs')).href); // Actual ESM linking, no alias rewrite of native exports.
    const api = await import(pathToFileURL(join(temp, 'node_modules/@minecraft/server/index.mjs')).href);
    const ui = await import(pathToFileURL(join(temp, 'node_modules/@minecraft/server-ui/index.mjs')).href);
    api.boot(); api.ticks(40);
    assert.equal(api.commands.size, 7);
    assert.ok(api.player.messages.some((s: string) => s.includes('/aibuilder:menu')));
    api.commands.get('aibuilder:menu').execute({ sourceEntity: api.player }); api.ticks(1);
    assert.equal(ui.shown[0], 'Minecraft AI Assistant');
    api.useCompass();
    assert.equal(ui.shown[1], 'Minecraft AI Assistant');
    assert.equal('LocationWaypoint' in api, false);
    assert.equal('BiomeTypes' in api, false);
    assert.equal('isChunkLoaded' in api.dimension, false);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('2.1.0 fallback preserves Image BuildPlan, build/resume/cancel/undo and waypoint guidance', async () => {
  const result = await build({ entryPoints: ['tests/support/android-scenarios.ts'], bundle: true, write: false, format: 'esm', platform: 'node', alias: { '@minecraft/server': resolve('tests/support/bedrock-1-21-100.ts') }, external: ['node:*'] });
  const temp = await mkdtemp(join(tmpdir(), 'aibuilder-compat-'));
  try {
    const file = join(temp, 'scenarios.mjs'); await writeFile(file, result.outputFiles![0]!.text);
    const scenario = await import(pathToFileURL(file).href); await scenario.run();
  } finally { await rm(temp, { recursive: true, force: true }); }
});
