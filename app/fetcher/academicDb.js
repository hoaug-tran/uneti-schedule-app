import path from "path";
import { getStoreDir } from "./storePath.js";
import { readJson, writeJsonAtomic, eraseJson } from "./jsonStore.js";
import { getStudentId } from "./userStore.js";
import { captureSession, assertSession } from "./sessionState.js";

const FILE = "academic-results.json";
const getPath = () => path.join(getStoreDir(), FILE);

export async function saveAcademicResults(payload, { owner, snapshot = captureSession() } = {}) {
  const current = await getStudentId();
  assertSession(snapshot);
  if (!current || (owner && owner !== current)) throw new Error("Session owner changed");
  await writeJsonAtomic(getPath(), { ...payload, owner: current, updated_at: Date.now() }, { guard: () => assertSession(snapshot) });
}

export async function loadAcademicResults() {
  const snapshot = captureSession();
  const owner = await getStudentId();
  const data = await readJson(getPath(), null);
  assertSession(snapshot);
  if (!owner || data?.owner !== owner || Date.now() - data.updated_at > 30 * 86400000) return null;
  return data;
}

export async function clearAcademicResults() {
  await eraseJson(getPath());
}
