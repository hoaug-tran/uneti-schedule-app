import { readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (/\.(?:c?js)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
for (const directory of ["app", "main", "scripts", "test"]) check(directory);
console.log("JavaScript syntax checks passed");
