const puppeteer = require("puppeteer-core");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true,
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--window-size=1400,900"],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto("http://localhost:5175/?preview=1", { waitUntil: "load", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: "verify1_initial.png" });

  // move character to test camera follow + no walls visible
  for (const key of ["KeyW","KeyW","KeyW","KeyW","KeyW","KeyW","KeyW","KeyW"]) {
    await page.keyboard.down(key);
    await new Promise((r) => setTimeout(r, 60));
    await page.keyboard.up(key);
  }
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "verify2_after_move.png" });

  for (const key of ["KeyA","KeyA","KeyA","KeyA","KeyA","KeyA"]) {
    await page.keyboard.down(key);
    await new Promise((r) => setTimeout(r, 60));
    await page.keyboard.up(key);
  }
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "verify3_after_move2.png" });

  await browser.close();
})();
