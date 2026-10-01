import { readdir } from 'node:fs/promises';
for (const file of (await readdir(new URL('../tests/',import.meta.url))).sort()) {
  if (file.endsWith('.test.ts')) await import(new URL('../tests/'+file,import.meta.url));
}
