import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { loadSource } from "./helpers/load.js";
import * as session from "../app/fetcher/sessionState.js";
async function scenario({ persist = true, profileFailure = false } = {}) {
  let win, writes = 0, erased = 0, cookiesSaved = 0;
  class FakeWindow extends EventEmitter {
    constructor() {
      super(); win = this; this.destroyed = false;
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, {
        session: { clearStorageData: async () => {}, cookies: { get: async () => [{ name: "access_token", value: "synthetic", domain: "support.uneti.edu.vn" }], set: async () => {} } },
        getURL: () => "https://support.uneti.edu.vn/uneti", isLoadingMainFrame: () => false,
        executeJavaScript: async () => ({ MaSinhVien: "SYNTHETIC" }), setWindowOpenHandler() {},
      });
    }
    loadURL() { return Promise.resolve(); }
    isDestroyed() { return this.destroyed; }
    show() {} hide() {} focus() {}
    close() { if (!this.destroyed) { this.destroyed = true; this.emit("closed"); } }
  }
  const api = await loadSource("app/fetcher/loginWindow.js", {
    electron: { BrowserWindow: FakeWindow, screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1200, height: 900 } }) } },
    "./sessionState.js": session,
    "./cookieManager.js": { saveCookiesToSecureStorage: async () => { cookiesSaved++; return persist; }, saveCookieHeaderToTxt: async () => true, getCookiePartition: () => "test", getJwtExpiration: () => Date.now() / 1000 + 3600, resumeCookiePersister() {}, suspendCookiePersister() {}, isUnetiDomain: () => true, clearAllCookies: async () => { erased++; } },
    "./userStore.js": { saveUser: async () => { writes++; session.invalidateSession(); const snapshot = session.captureSession(); if (profileFailure) { const error = new Error("Disk failed"); error.sessionSnapshot = snapshot; throw error; } return snapshot; }, clearUser: async () => { session.invalidateSession(); } },
    "../utils/logger.js": { logger: { info() {}, warn() {}, debug() {}, error() {} } },
  });
  const pending = api.showLoginWindow();
  pending.catch(() => {});
  await new Promise(resolve => setImmediate(resolve));
  win.webContents.emit("did-navigate", {}, "https://support.uneti.edu.vn/uneti");
  win.webContents.emit("did-navigate", {}, "https://support.uneti.edu.vn/uneti");
  return { pending, stats: () => ({ writes, erased, cookiesSaved }) };
}
test("failed secure persistence never commits profile", async () => {
  const run = await scenario({ persist: false });
  await assert.rejects(run.pending, /Failed to persist/);
  assert.deepEqual(run.stats(), { writes: 0, erased: 0, cookiesSaved: 1 });
});
test("profile write failure rolls back credentials from that transaction", async () => {
  const run = await scenario({ profileFailure: true });
  await assert.rejects(run.pending, /Disk failed/);
  assert.deepEqual(run.stats(), { writes: 1, erased: 1, cookiesSaved: 1 });
});
test("duplicate navigation captures the login exactly once", async () => {
  const run = await scenario();
  assert.match(await run.pending, /access_token=/);
  assert.deepEqual(run.stats(), { writes: 1, erased: 0, cookiesSaved: 1 });
});
