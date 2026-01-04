import crypto from "crypto";
import os from "os";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

function getMachineKey() {
    const hostname = os.hostname();
    const username = os.userInfo().username;
    const machineId = `${hostname}-${username}`;
    const salt = crypto.createHash("sha256").update(machineId).digest();
    const key = crypto.pbkdf2Sync(machineId, salt, 100000, KEY_LENGTH, "sha256");

    return key;
}

export function encrypt(plaintext) {
    try {
        const key = getMachineKey();
        const iv = crypto.randomBytes(IV_LENGTH);

        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(plaintext, "utf8", "base64");
        encrypted += cipher.final("base64");

        const authTag = cipher.getAuthTag();

        const combined = Buffer.concat([
            iv,
            Buffer.from(encrypted, "base64"),
            authTag,
        ]);

        return combined.toString("base64");
    } catch (err) {
        throw new Error(`Encryption failed: ${err.message}`);
    }
}

export function decrypt(encryptedData) {
    try {
        const key = getMachineKey();
        const combined = Buffer.from(encryptedData, "base64");
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
    const json = JSON.stringify(data);
    return encrypt(json);
}

export function decryptJSON(encryptedData) {
    const json = decrypt(encryptedData);
    return JSON.parse(json);
}
