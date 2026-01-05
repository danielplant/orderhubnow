import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const OLD_SITE = 'https://inventory.limeapple.ca/USA';
const NEW_SITE = 'https://www.orderhubnow.com';
const ADMIN_USER = 'LimeAdmin';
const ADMIN_PASS = 'Green2022###!';

const screenshotDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function takeScreenshot(page: Page, name: string) {
  const filepath = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`Screenshot saved: ${filepath}`);
  return filepath;
}

async function exploreOldSite(browser: Browser) {
  console.log('\n=== EXPLORING OLD SITE: inventory.limeapple.ca ===\n');
  const page = await browser.newPage();

  try {
    // Navigate to old site
    console.log('Navigating to old site...');
    await page.goto(OLD_SITE, { waitUntil: 'networkidle', timeout: 30000 });
    await takeScreenshot(page, 'old-site-initial');

    console.log('Page title:', await page.title());
    console.log('Current URL:', page.url());

    // Look for login form
    const loginForm = await page.$('form');
    if (loginForm) {
      console.log('Login form found');

      // Find username field
      const usernameInput = await page.$('input[name="username"], input[name="user"], input[type="text"]');
      const passwordInput = await page.$('input[type="password"]');
      const submitBtn = await page.$('button[type="submit"], input[type="submit"]');

      if (usernameInput && passwordInput) {
        console.log('Filling login credentials...');
        await usernameInput.fill(ADMIN_USER);
        await passwordInput.fill(ADMIN_PASS);
        await takeScreenshot(page, 'old-site-login-filled');

        if (submitBtn) {
          await submitBtn.click();
          await page.waitForLoadState('networkidle');
          await takeScreenshot(page, 'old-site-after-login');
          console.log('After login URL:', page.url());
        }
      }
    }

    // Extract all navigation links
    const navLinks = await page.$$eval('nav a, aside a, .sidebar a, .menu a', links =>
      links.map(l => ({ text: l.textContent?.trim(), href: l.getAttribute('href') }))
    );
    console.log('\nNavigation links found:', navLinks.length);
    navLinks.forEach(l => console.log(`  - ${l.text}: ${l.href}`));

    // Extract all buttons
    const buttons = await page.$$eval('button', btns =>
      btns.map(b => b.textContent?.trim()).filter(t => t && t.length < 50)
    );
    console.log('\nButtons found:', buttons);

    // Look for report-related elements
    const reportElements = await page.$$eval('[class*="report"], [id*="report"], a[href*="report"]', els =>
      els.map(e => ({ tag: e.tagName, text: e.textContent?.trim()?.substring(0, 50), href: e.getAttribute('href') }))
    );
    console.log('\nReport elements:', reportElements);

    // Click through main navigation items
    const mainNavItems = await page.$$('nav a, .sidebar a');
    for (let i = 0; i < Math.min(mainNavItems.length, 10); i++) {
      try {
        const navItem = mainNavItems[i];
        const text = await navItem.textContent();
        const href = await navItem.getAttribute('href');
        if (href && !href.startsWith('javascript') && !href.startsWith('#')) {
          console.log(`\nClicking: ${text} -> ${href}`);
          await navItem.click();
          await page.waitForLoadState('networkidle');
          await takeScreenshot(page, `old-site-nav-${i}-${text?.replace(/\s+/g, '-').substring(0, 20)}`);
        }
      } catch (e) {
        console.log(`  Error navigating: ${e}`);
      }
    }

    return { success: true, navLinks, buttons, reportElements };
  } catch (error) {
    console.error('Error exploring old site:', error);
    await takeScreenshot(page, 'old-site-error');
    return { success: false, error: String(error) };
  } finally {
    await page.close();
  }
}

async function exploreNewSite(browser: Browser) {
  console.log('\n=== EXPLORING NEW SITE: orderhubnow.com ===\n');
  const page = await browser.newPage();

  try {
    // Navigate to admin login
    console.log('Navigating to new site admin login...');
    await page.goto(`${NEW_SITE}/admin/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await takeScreenshot(page, 'new-site-login');

    console.log('Page title:', await page.title());

    // Fill login form
    const usernameInput = await page.$('input[name="username"], input[name="email"], input[type="text"], input[type="email"]');
    const passwordInput = await page.$('input[type="password"]');
    const submitBtn = await page.$('button[type="submit"]');

    if (usernameInput && passwordInput) {
      console.log('Filling login credentials...');
      await usernameInput.fill(ADMIN_USER);
      await passwordInput.fill(ADMIN_PASS);
      await takeScreenshot(page, 'new-site-login-filled');

      if (submitBtn) {
        await submitBtn.click();
        await page.waitForLoadState('networkidle');
        await takeScreenshot(page, 'new-site-after-login');
        console.log('After login URL:', page.url());
      }
    }

    // Navigate through admin pages
    const adminPages = [
      '/admin',
      '/admin/reports',
      '/admin/orders',
      '/admin/products',
      '/admin/categories',
      '/admin/inventory',
      '/admin/customers',
      '/admin/reps',
      '/admin/prepacks',
      '/admin/shopify',
      '/admin/settings'
    ];

    for (const adminPage of adminPages) {
      try {
        console.log(`\nNavigating to: ${adminPage}`);
        await page.goto(`${NEW_SITE}${adminPage}`, { waitUntil: 'networkidle', timeout: 30000 });
        await takeScreenshot(page, `new-site-${adminPage.replace(/\//g, '-')}`);

        // Extract page elements
        const headings = await page.$$eval('h1, h2, h3', els => els.map(e => e.textContent?.trim()));
        const buttons = await page.$$eval('button', els => els.map(e => e.textContent?.trim()).filter(t => t && t.length < 50));
        console.log('  Headings:', headings.slice(0, 5));
        console.log('  Buttons:', buttons.slice(0, 10));
      } catch (e) {
        console.log(`  Error on ${adminPage}: ${e}`);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error exploring new site:', error);
    await takeScreenshot(page, 'new-site-error');
    return { success: false, error: String(error) };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('Starting site exploration...\n');

  // Use existing cached Chrome browser
  const chromePath = '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome';
  console.log('Using Chrome at:', chromePath);

  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath
  });

  try {
    const oldSiteResults = await exploreOldSite(browser);
    const newSiteResults = await exploreNewSite(browser);

    // Save results
    const results = {
      timestamp: new Date().toISOString(),
      oldSite: oldSiteResults,
      newSite: newSiteResults
    };

    fs.writeFileSync(
      path.join(__dirname, 'exploration-results.json'),
      JSON.stringify(results, null, 2)
    );

    console.log('\n=== EXPLORATION COMPLETE ===');
    console.log('Results saved to exploration-results.json');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
