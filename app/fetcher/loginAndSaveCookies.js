import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";
import { app } from "electron";

const storeDir = path.join(app.getPath("userData"), "store");
const COOKIE_TXT = path.join(storeDir, "cookies.txt");

async function loginAndSaveCookies() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://sinhvien.uneti.edu.vn/sinh-vien-dang-nhap.html", {
    waitUntil: "load",
  });

  await page.waitForURL("**/dashboard.html", { timeout: 0 });

  const cookies = await context.cookies("https://sinhvien.uneti.edu.vn");
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  await fs.mkdir(storeDir, { recursive: true });
  await fs.writeFile(COOKIE_TXT, cookieHeader, "utf8");

  await browser.close();
  return cookieHeader;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loginAndSaveCookies().catch((err) => {
    console.error("Login failed:", err);
    process.exit(1);
  });
}

export { loginAndSaveCookies };
