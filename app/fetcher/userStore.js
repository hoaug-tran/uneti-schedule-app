import path from "path";
import { getStoreDir } from "./storePath.js";
import { readJson, writeJsonAtomic } from "./jsonStore.js";

const FILE = "user.json";
const getPath = () => path.join(getStoreDir(), FILE);

export async function saveUser(user) {
  if (!user) return;
  await writeJsonAtomic(getPath(), { ...user, updated_at: Date.now() });
}

export async function loadUser() {
  return readJson(getPath(), null);
}

export async function getStudentId() {
  const data = await loadUser();
  if (!data) return null;
  return data.MaSinhVien || data.studentId || data.username || data.user?.MaSinhVien || null;
}

export async function clearUser() {
  await writeJsonAtomic(getPath(), null);
}
