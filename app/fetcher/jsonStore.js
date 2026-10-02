import fs from "fs/promises";
import path from "path";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    try {
      return JSON.parse(await fs.readFile(`${filePath}.bak`, "utf8"));
    } catch {
      return fallback;
    }
  }
}

export async function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const rand = Math.random().toString(36).slice(2, 8);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${Date.now()}.${rand}.tmp`);
  const bak = `${filePath}.bak`;

  try {
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");

    try {
      await fs.copyFile(filePath, bak);
    } catch {}

    let retries = 4;
    while (retries > 0) {
      try {
        await fs.rename(tmp, filePath);
        return;
      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        await sleep(60);
      }
    }
  } catch (err) {
    try {
      await fs.unlink(tmp);
    } catch {}
    throw err;
  }
}
