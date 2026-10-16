import { test, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { loadSource } from "./helpers/load.js";

function makeJwt(expSec) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSec })).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("encryption module safeStorage & legacy migration", async () => {
  const mockSafe = {
    available: true,
    isEncryptionAvailable() { return this.available; },
    encryptString(str) { return Buffer.from("safe:" + str, "utf8"); },
    decryptString(buf) {
      const s = buf.toString("utf8");
      if (!s.startsWith("safe:")) throw new Error("bad safeStorage payload");
      return s.slice(5);
    },
  };

  const encMod = await loadSource("app/utils/encryption.js", {
    electron: { safeStorage: mockSafe },
    os: { default: { hostname: () => "TEST-PC", userInfo: () => ({ username: "tester" }) } },
  });

  it("encrypts using safeStorage with versioned prefix v1:", () => {
    const encrypted = encMod.encrypt("secret_token");
    assert.match(encrypted, /^v1:/);
    assert.equal(encMod.decrypt(encrypted), "secret_token");
  });

  it("rejects when safeStorage is unavailable", () => {
    mockSafe.available = false;
    assert.throws(() => encMod.encrypt("plain"), /safeStorage encryption is unavailable/);
    mockSafe.available = true;
  });

  it("rejects basic_text without header", () => {
    assert.throws(() => encMod.decrypt("not-valid-base64"));
  });

  it("decrypts legacy machine-key payload for migration", () => {
    const hostname = "TEST-PC";
    const username = "tester";
    const machineId = `${hostname}-${username}`;
    const salt = crypto.createHash("sha256").update(machineId).digest();
    const key = crypto.pbkdf2Sync(machineId, salt, 100000, 32, "sha256");
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let enc = cipher.update("legacy_secret_value", "utf8", "base64");
    enc += cipher.final("base64");
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, Buffer.from(enc, "base64"), tag]).toString("base64");

    assert.equal(encMod.decrypt(combined), "legacy_secret_value");
  });
});

describe("cookieManager domain, access_token and clearAllCookies", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "uneti-cookie-test-"));
  let sessionCookies = [];
  let clearedStorage = false;
  let failKeytar = false;
  const keytarDb = new Map();

  const mockSession = {
    fromPartition: () => ({
      cookies: {
        get: async () => [...sessionCookies],
        set: async (c) => {
          const idx = sessionCookies.findIndex((x) => x.name === c.name);
          if (idx >= 0) sessionCookies[idx] = c;
          else sessionCookies.push(c);
        },
        remove: async (_url, name) => {
          sessionCookies = sessionCookies.filter((x) => x.name !== name);
        },
        on: () => {},
      },
      clearStorageData: async () => { clearedStorage = true; sessionCookies = []; },
      clearCache: async () => {},
      flushStorageData: async () => {},
    }),
  };

  const mockKeytar = {
    async setPassword(service, account, pass) {
      if (failKeytar) throw new Error("keytar-write-fail");
      keytarDb.set(`${service}:${account}`, pass);
    },
    async getPassword(service, account) {
      if (failKeytar) throw new Error("keytar-read-fail");
      return keytarDb.get(`${service}:${account}`) || null;
    },
    async deletePassword(service, account) {
      if (failKeytar) throw new Error("keytar-delete-fail");
      keytarDb.delete(`${service}:${account}`);
      return true;
    },
  };

  const cookieMod = await loadSource("app/fetcher/cookieManager.js", {
    electron: {
      session: mockSession,
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (s) => Buffer.from("safe:" + s),
        decryptString: (b) => b.toString().slice(5),
      },
    },
    keytar: { default: mockKeytar },
    "./storePath.js": { getStoreDir: () => tempDir },
    "../utils/logger.js": { logger: { debug() {}, info() {}, warn() {}, error() {} } },
  });

  it("strictly checks domain suffix, rejecting attacker domains", () => {
    assert.equal(cookieMod.isUnetiDomain("uneti.edu.vn"), true);
    assert.equal(cookieMod.isUnetiDomain("support.uneti.edu.vn"), true);
    assert.equal(cookieMod.isUnetiDomain(".uneti.edu.vn"), true);
    assert.equal(cookieMod.isUnetiDomain("uneti.edu.vn.attacker.invalid"), false);
    assert.equal(cookieMod.isUnetiDomain("fake-uneti.edu.vn"), false);
  });

  it("areCookiesValid returns false without valid access_token", async () => {
    sessionCookies = [{ name: "_ga", value: "123", domain: "uneti.edu.vn" }];
    assert.equal(await cookieMod.areCookiesValid(), false);

    const expiredJwt = makeJwt(Math.floor(Date.now() / 1000) - 3600);
    sessionCookies.push({ name: "access_token", value: expiredJwt, domain: "uneti.edu.vn" });
    assert.equal(await cookieMod.areCookiesValid(), false);
  });

  it("areCookiesValid returns true with non-expired access_token on uneti domain", async () => {
    const validJwt = makeJwt(Math.floor(Date.now() / 1000) + 7200);
    sessionCookies = [{ name: "access_token", value: validJwt, domain: "support.uneti.edu.vn" }];
    assert.equal(await cookieMod.areCookiesValid(), true);
    const header = await cookieMod.buildCookieHeader();
    assert.match(header, /access_token=/);
  });

  it("removes legacy cookies.txt on successful saveCookiesToSecureStorage", async () => {
    const txtPath = path.join(tempDir, "cookies.txt");
    await fs.writeFile(txtPath, "legacy_data", "utf8");
    const validJwt = makeJwt(Math.floor(Date.now() / 1000) + 7200);
    const ok = await cookieMod.saveCookiesToSecureStorage([
      { name: "access_token", value: validJwt, domain: "uneti.edu.vn" },
    ]);
    assert.equal(ok, true);
    const exists = await fs.access(txtPath).then(() => true).catch(() => false);
    assert.equal(exists, false);
  });

  it("clearAllCookies cleans storage, files, keytar, and propagates error on failure", async () => {
    clearedStorage = false;
    sessionCookies = [{ name: "a", value: "1", domain: "uneti.edu.vn" }];
    await cookieMod.clearAllCookies();
    assert.equal(sessionCookies.length, 0);
    assert.equal(clearedStorage, true);

    failKeytar = true;
    await assert.rejects(() => cookieMod.clearAllCookies(), error => error instanceof AggregateError && error.errors.some(e => e.message === "keytar-delete-fail"));
    failKeytar = false;
  });
});

describe("loginWindow single-flight, profile guard and cancelLoginWindow", async () => {
  let activeWinInstance = null;
  class MockBrowserWindow {
    constructor() {
      this._destroyed = false;
      this._listeners = {};
      this.webContents = {
        session: { cookies: { get: async () => [] } },
        executeJavaScript: async () => null,
        on: () => {},
      };
      activeWinInstance = this;
    }
    loadURL() { return Promise.resolve(); }
    show() {}
    hide() {}
    focus() {}
    close() {
      this._destroyed = true;
      if (this._listeners["closed"]) this._listeners["closed"]();
    }
    isDestroyed() { return this._destroyed; }
    on(event, fn) { this._listeners[event] = fn; }
  }

  const mockScreen = {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { width: 1920, height: 1080, x: 0, y: 0 } }),
  };

  let userSaved = null;
  let currentGeneration = 0;

  const loginMod = await loadSource("app/fetcher/loginWindow.js", {
    electron: { BrowserWindow: MockBrowserWindow, screen: mockScreen },
    "./cookieManager.js": {
      saveCookiesToSecureStorage: async () => true,
      saveCookieHeaderToTxt: async () => true,
      getCookiePartition: () => "test-part",
      getJwtExpiration: () => Math.floor(Date.now() / 1000) + 3600,
      resumeCookiePersister: () => {},
      suspendCookiePersister: () => {},
      clearAllCookies: async () => {},
      isUnetiDomain: () => true,
    },
    "./userStore.js": {
      saveUser: async (u) => { userSaved = u; },
      clearUser: async () => {},
    },
    "./sessionState.js": {
      captureSession: () => ({ generation: currentGeneration }),
      assertSession: (snap) => {
        if (snap.generation !== currentGeneration) throw new Error("Session changed");
      },
    },
    "../utils/logger.js": { logger: { debug() {}, info() {}, warn() {}, error() {} } },
  });

  it("returns same promise on multiple showLoginWindow calls", () => {
    const p1 = loginMod.showLoginWindow();
    const p2 = loginMod.showLoginWindow();
    assert.equal(p1, p2);
    loginMod.cancelLoginWindow();
    assert.rejects(p1, /Login cancelled/);
  });

  it("cancelLoginWindow rejects active login promise with Login cancelled", async () => {
    const p = loginMod.showLoginWindow();
    loginMod.cancelLoginWindow();
    await assert.rejects(p, /Login cancelled/);
  });

  it("window closed manually rejects with Login cancelled", async () => {
    const p = loginMod.showLoginWindow();
    activeWinInstance.close();
    await assert.rejects(p, /Login cancelled/);
  });
});
