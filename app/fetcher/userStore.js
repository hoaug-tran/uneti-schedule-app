import path from "path";
import { getStoreDir } from "./storePath.js";
import { readJson, writeJsonAtomic, eraseJson } from "./jsonStore.js";
import { invalidateSession, captureSession, assertSession } from "./sessionState.js";

const FILE = "user.json";
const getPath = () => path.join(getStoreDir(), FILE);

export async function saveUser(user) {
  if (!user || !studentIdOf(user)) throw new Error("Missing student ID");
  const before = captureSession();
  await loadUser();
  assertSession(before);
  invalidateSession();
  const snapshot = captureSession();
  try {
    await writeJsonAtomic(getPath(), { ...user, updated_at: Date.now() }, { guard: () => assertSession(snapshot), backup: false });
  } catch (error) { error.sessionSnapshot = snapshot; throw error; }
  assertSession(snapshot);
  return snapshot;
}

export async function loadUser() {
  return readJson(getPath(), null, { recoverBackup: false });
}

export async function getStudentId() {
  const data = await loadUser();
  const id = studentIdOf(data);
  return id ? String(id) : null;
}

function studentIdOf(data) {
  return data?.MaSinhVien || data?.studentId || data?.username || data?.user?.MaSinhVien || null;
}

export async function clearUser() {
  invalidateSession();
  await eraseJson(getPath());
}
