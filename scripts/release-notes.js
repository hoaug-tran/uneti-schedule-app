import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function extractReleaseNotes(changelog, version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid package version: ${version}`);
  }
  const sections = [];
  let section = null;
  let fence = null;
  for (const line of changelog.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n")) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && !fence) {
      fence = marker;
    } else if (fence && new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) {
      fence = null;
    } else if (!fence && /^##\s+/.test(line)) {
      const heading = line.replace(/^##\s+/, "").replace(/\s+#+\s*$/, "").trim();
      const match = /^(?:\[v?([^\]]+)\]|v?([^\s]+))(?:\s+-\s+.*)?$/.exec(heading);
      section = { version: match?.[1] ?? match?.[2], lines: [] };
      sections.push(section);
      continue;
    }
    section?.lines.push(line);
  }
  const matches = sections.filter((entry) => entry.version === version);
  if (matches.length !== 1) {
    throw new Error(`CHANGELOG.md must contain exactly one "## [${version}]" section (found ${matches.length})`);
  }
  const notes = matches[0].lines.join("\n").trim();
  const meaningful = notes.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*#{1,6}\s+.*$/gm, "").trim();
  if (!meaningful) throw new Error(`CHANGELOG.md section ${version} is empty`);
  return `${notes}\n`;
}

export function writeReleaseNotes(root) {
  const output = path.join(root, "dist", "release-notes.md");
  rmSync(output, { force: true });
  const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const notes = extractReleaseNotes(readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), version);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, notes, "utf8");
  return version;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    console.log(`Release notes generated for v${writeReleaseNotes(root)}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
