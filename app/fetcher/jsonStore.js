import fs from "fs/promises";
import path from "path";

export async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); }
  catch { return fallback; }
}

export async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}
