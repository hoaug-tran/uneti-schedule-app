import path from "path";
import { getStoreDir } from "./storePath.js";
import { readJson, writeJsonAtomic } from "./jsonStore.js";

const FILE = "academic-results.json";
const getPath = () => path.join(getStoreDir(), FILE);

export async function saveAcademicResults(payload) {
  await writeJsonAtomic(getPath(), { ...payload, updated_at: Date.now() });
}

export async function loadAcademicResults() {
  return readJson(getPath(), null);
}

export async function clearAcademicResults() {
  await writeJsonAtomic(getPath(), null);
}
