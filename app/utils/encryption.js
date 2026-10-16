import crypto from "crypto";
import os from "os";
import { safeStorage } from "electron";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

export function isSafeStorageAvailable() {
  return typeof safeStorage?.isEncryptionAvailable === "function" && safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== "basic_text";
}

function getMachineKey() {
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const machineId = `${hostname}-${username}`;
  const salt = crypto.createHash("sha256").update(machineId).digest();
  return crypto.pbkdf2Sync(machineId, salt, 100000, KEY_LENGTH, "sha256");
}

export function encrypt(plaintext) {
  if (typeof plaintext !== "string") {
    throw new TypeError("Plaintext must be a string");
  }
  if (!isSafeStorageAvailable()) {
    throw new Error("safeStorage encryption is unavailable");
  }
  const buf = safeStorage.encryptString(plaintext);
  return `v1:${buf.toString("base64")}`;
}

export function decrypt(ciphertext) {
  if (typeof ciphertext !== "string" || !ciphertext) {
    throw new Error("Decryption failed: empty input");
  }
  if (ciphertext.startsWith("v1:")) {
    if (!isSafeStorageAvailable()) {
      throw new Error("safeStorage encryption is unavailable");
    }
    const buf = Buffer.from(ciphertext.slice(3), "base64");
    return safeStorage.decryptString(buf);
  }
  return decryptLegacy(ciphertext);
}

export function decryptLegacy(encryptedData) {
  try {
    const key = getMachineKey();
    const combined = Buffer.from(encryptedData, "base64");
    if (combined.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error("Invalid payload length");
    }
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(combined.length - TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, undefined, "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    throw new Error(`Decryption failed: ${err.message}`);
  }
}

export function isEncrypted(data) {
  if (!data || typeof data !== "string") return false;
  if (data.startsWith("v1:")) return true;
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Regex.test(data)) return false;
  try {
    const buffer = Buffer.from(data, "base64");
    return buffer.length >= IV_LENGTH + TAG_LENGTH;
  } catch {
    return false;
  }
}

export function encryptJSON(data) {
  return encrypt(JSON.stringify(data));
}

export function decryptJSON(encryptedData) {
  return JSON.parse(decrypt(encryptedData));
}
