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

  // Move left (A) toward room A/B column, then down slightly, to walk into room A door (east-facing door)
  for (const key of ["KeyA","KeyA","KeyA","KeyA","KeyA","KeyA","KeyA","KeyA","KeyA","KeyA"]) {
    await page.keyboard.down(key); await new Promise((r)=>setTimeout(r,60)); await page.keyboard.up(key);
  }
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "verify4_near_roomA.png" });

  for (const key of ["KeyW","KeyW","KeyW","KeyW"]) {
    await page.keyboard.down(key); await new Promise((r)=>setTimeout(r,60)); await page.keyboard.up(key);
  }
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "verify5_inside_roomA.png" });

  await page.keyboard.down("KeyE"); await new Promise((r)=>setTimeout(r,150)); await page.keyboard.up("KeyE");
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "verify6_modal.png" });

  await browser.close();
})();
