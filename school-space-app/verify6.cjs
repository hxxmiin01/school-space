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

  page.on("console", msg => console.log("PAGE LOG:", msg.text()));

  async function hold(key, ms) {
    await page.keyboard.down(key);
    await new Promise((r)=>setTimeout(r,ms));
    await page.keyboard.up(key);
  }

  await page.screenshot({ path: "verifyA_start.png" });
  await hold("KeyA", 2000);
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "verifyA_after.png" });

  await browser.close();
})();
