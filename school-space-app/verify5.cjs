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
  async function holdBoth(key1, key2, ms) {
    await page.keyboard.down(key1); await page.keyboard.down(key2);
    await new Promise((r)=>setTimeout(r,ms));
    await page.keyboard.up(key1); await page.keyboard.up(key2);
  }

  await hold("KeyW", 1000);
  await new Promise((r) => setTimeout(r, 150));
  // walk diagonally into the door while also nudging north/south to find the gap, then push west through
  await holdBoth("KeyA", "KeyS", 1500);
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "verify11_inside_roomA_v4.png" });

  await page.keyboard.down("KeyE"); await new Promise((r)=>setTimeout(r,150)); await page.keyboard.up("KeyE");
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "verify12_modal_v4.png" });

  await browser.close();
})();
