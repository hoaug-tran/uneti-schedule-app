import { app } from "../../main/bootstrap.js";
import path from "path";

function getStoreDir() {
  return path.join(app.getPath("userData"), "store");
}

function getPaths() {
  const storeDir = getStoreDir();
  return {
    STORE_DIR: storeDir,
    COOKIE_TXT: path.join(storeDir, "cookies.txt"),
    OUT_JSON: path.join(storeDir, "schedule.json"),
    RAW_HTML: path.join(storeDir, "fragment.html"),
  };
}

export { getStoreDir, getPaths };
