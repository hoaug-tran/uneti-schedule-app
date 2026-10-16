import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SourceTextModule, SyntheticModule, createContext } from "node:vm";
const root = fileURLToPath(new URL("../../", import.meta.url));
export async function loadSource(entry, mocks = {}, globals = null) {
  const context = globals ? createContext(globals) : undefined;
  const cache = new Map();
  async function get(id, parent) {
    const relative = id.startsWith(".") ? path.resolve(path.dirname(parent), id) : id;
    const mock = mocks[id] ?? mocks[relative] ?? mocks[path.relative(root, relative).replaceAll("\\", "/")];
    const key = mock ? `mock:${id}` : relative;
    if (cache.has(key)) return cache.get(key);
    if (mock || !path.isAbsolute(relative)) {
      const exports = mock ?? await import(id);
      const mod = new SyntheticModule(Object.keys(exports), function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      }, { identifier: key, context });
      cache.set(key, mod);
      return mod;
    }
    const mod = new SourceTextModule(await readFile(relative, "utf8"), { identifier: relative, context, initializeImportMeta(meta) { meta.url = pathToFileURL(relative).href; } });
    cache.set(key, mod);
    return mod;
  }
  const file = path.resolve(root, entry);
  const mod = await get(file, file);
  await mod.link((id, parent) => get(id, parent.identifier));
  await mod.evaluate();
  return mod.namespace;
}
