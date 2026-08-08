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

  async function press(key, times, ms=60) {
    for (let i=0;i<times;i++) {
      await page.keyboard.down(key); await new Promise((r)=>setTimeout(r,ms)); await page.keyboard.up(key);
    }
  }

  await press("KeyW", 6); // align north toward room A door row
  await new Promise((r) => setTimeout(r, 200));
  await press("KeyA", 12); // walk west through door into room A
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "verify7_inside_roomA_v2.png" });

  await page.keyboard.down("KeyE"); await new Promise((r)=>setTimeout(r,150)); await page.keyboard.up("KeyE");
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "verify8_modal_v2.png" });

  await browser.close();
})();
