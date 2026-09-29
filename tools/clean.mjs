import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve("dist");
if (!target.endsWith("/dist")) throw new Error("Refusing to clean unexpected path");
await rm(target, { recursive: true, force: true });
