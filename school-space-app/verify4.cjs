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

  async function hold(key, ms) {
    await page.keyboard.down(key);
    await new Promise((r)=>setTimeout(r,ms));
    await page.keyboard.up(key);
  }

  await hold("KeyW", 900); // move north ~ z: 1.05 -> ~-2.7 (0.9s*4.2 ~ 3.78 units north)
  await new Promise((r) => setTimeout(r, 200));
  await hold("KeyA", 1200); // move west into and through room A door
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "verify9_inside_roomA_v3.png" });

  await page.keyboard.down("KeyE"); await new Promise((r)=>setTimeout(r,150)); await page.keyboard.up("KeyE");
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "verify10_modal_v3.png" });

  await browser.close();
})();
