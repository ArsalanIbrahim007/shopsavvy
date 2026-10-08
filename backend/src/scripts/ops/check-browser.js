// check-browser.js — can the headless browser (iShopping and Paklap need it) be found and started from THIS process?
// Run by check-task-browser.ps1 inside a Task Scheduler task, to compare with a normal terminal. Prints, changes nothing.

import { accessSync, constants, existsSync } from "node:fs";
import os from "node:os";

import { chromium } from "playwright";

const exe = chromium.executablePath();
const shell = exe.replace(/chromium-(\d+)[\\/]chrome-win64[\\/]chrome\.exe$/i, "chromium_headless_shell-$1\\chrome-headless-shell-win64\\chrome-headless-shell.exe");
console.log(`[${new Date().toISOString()}] browser check`);
console.log("user:", os.userInfo().username, "| homedir:", os.homedir());
console.log("LOCALAPPDATA:", process.env.LOCALAPPDATA, "| USERPROFILE:", process.env.USERPROFILE, "| PLAYWRIGHT_BROWSERS_PATH:", process.env.PLAYWRIGHT_BROWSERS_PATH ?? "(not set)");
console.log("cwd:", process.cwd(), "| node:", process.version, "| env variables:", Object.keys(process.env).length);
for (const [label, path] of [["chromium", exe], ["headless shell", shell]]) {
  let access = "ok";
  try { accessSync(path, constants.R_OK); } catch (err) { access = `${err.code}`; }
  console.log(`${label}: exists=${existsSync(path)} access=${access} ${path}`);
}

try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("about:blank");
  console.log("LAUNCH OK, version", browser.version());
  await browser.close();
} catch (err) {
  console.log("LAUNCH FAILED:", String(err.message).split("\n")[0].slice(0, 400));
}
process.exit(0);
