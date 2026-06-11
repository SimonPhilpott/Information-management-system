const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message, error.stack));
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);
  
  // Find and click the Spatial Knowledge Graph button
  try {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const target = buttons.find(b => b.textContent && b.textContent.includes('Spatial Knowledge Graph'));
      if (target) target.click();
    });
  } catch (e) {
    console.log('Could not click', e);
  }
  
  await page.waitForTimeout(3000);
  await browser.close();
})();
