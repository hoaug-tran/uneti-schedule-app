import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractReleaseNotes, writeReleaseNotes } from "../scripts/release-notes.js";

test("selects the exact package version, excluding other releases and Unreleased", () => {
  const input = "# Changelog\n## [Unreleased]\nfuture\n## [1.9.30]\nwrong\n## [1.9.3] - 2026-10-16\n### Fixed\n- Đã sửa lỗi.\n## [1.9.2]\nold\n";
  assert.equal(extractReleaseNotes(input, "1.9.3"), "### Fixed\n- Đã sửa lỗi.\n");
});

test("supports CRLF, BOM, v prefix and prerelease versions", () => {
  assert.equal(extractReleaseNotes("\uFEFF# Changelog\r\n## v2.0.0-beta.1\r\n- Preview\r\n", "2.0.0-beta.1"), "- Preview\n");
  assert.equal(extractReleaseNotes("## [v1.9.3]\n- Change", "1.9.3"), "- Change\n");
});

test("fails closed for missing, duplicate, invalid and empty versions", () => {
  for (const input of ["## [1.9.2]\nold", "## [1.9.3]\na\n## v1.9.3\nb", "## [1.9.3]\n\n## [1.9.2]\nold", "## [1.9.3]\n### Fixed\n<!-- pending -->"]) {
    assert.throws(() => extractReleaseNotes(input, "1.9.3"));
  }
  assert.throws(() => extractReleaseNotes("## [Unreleased]\nfuture", "Unreleased"));
});

test("ignores release-like headings inside fenced examples", () => {
  const notes = "- Example:\n```md\n## [1.9.2]\nexample\n```\n~~~md\n## [1.9.3]\nexample\n~~~\n- End\n";
  assert.equal(extractReleaseNotes(`## [1.9.3]\n${notes}## [1.9.2]\nold`, "1.9.3"), notes);
});

test("writes UTF-8 notes and removes stale output on validation failure", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "uneti-release-"));
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "1.9.3" }));
    writeFileSync(path.join(root, "CHANGELOG.md"), "## [1.9.3]\n- Tiếng Việt\n## [1.9.2]\nold");
    assert.equal(writeReleaseNotes(root), "1.9.3");
    const output = path.join(root, "dist", "release-notes.md");
    assert.equal(readFileSync(output, "utf8"), "- Tiếng Việt\n");
    writeFileSync(path.join(root, "CHANGELOG.md"), "## [1.9.2]\nold");
    assert.throws(() => writeReleaseNotes(root));
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
