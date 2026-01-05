import { test, expect, Page, Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const OLD_SITE_BASE = 'https://inventory.limeapple.ca';
const NEW_SITE_BASE = 'https://www.orderhubnow.com';

const ADMIN_CREDENTIALS = {
  username: 'LimeAdmin',
  password: 'Green2022###!'
};

interface FeatureInfo {
  name: string;
  url: string;
  found: boolean;
  screenshot?: string;
  elements?: string[];
  notes?: string;
}

interface SiteAnalysis {
  site: string;
  loginSuccess: boolean;
  features: FeatureInfo[];
  navigation: string[];
  reports: string[];
  timestamp: string;
}

const screenshotDir = path.join(__dirname, 'screenshots');

// Ensure screenshot directory exists
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function saveScreenshot(page: Page, name: string): Promise<string> {
  const filename = `${name}-${Date.now()}.png`;
  const filepath = path.join(screenshotDir, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

async function extractPageInfo(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const elements: string[] = [];

    // Get all navigation items
    const navItems = document.querySelectorAll('nav a, aside a, [role="navigation"] a');
    navItems.forEach(item => {
      const text = item.textContent?.trim();
      const href = item.getAttribute('href');
      if (text && href) {
        elements.push(`Nav: ${text} -> ${href}`);
      }
    });

    // Get all buttons
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
      const text = btn.textContent?.trim();
      if (text && text.length < 50) {
        elements.push(`Button: ${text}`);
      }
    });

    // Get all table headers
    const headers = document.querySelectorAll('th, [role="columnheader"]');
    headers.forEach(h => {
      const text = h.textContent?.trim();
      if (text) {
        elements.push(`TableHeader: ${text}`);
      }
    });

    // Get all form labels
    const labels = document.querySelectorAll('label');
    labels.forEach(l => {
      const text = l.textContent?.trim();
      if (text) {
        elements.push(`FormLabel: ${text}`);
      }
    });

    // Get headings
    const headings = document.querySelectorAll('h1, h2, h3');
    headings.forEach(h => {
      const text = h.textContent?.trim();
      if (text) {
        elements.push(`Heading: ${text}`);
      }
    });

    return [...new Set(elements)]; // Remove duplicates
  });
}

test.describe('Old Inventory Site (inventory.limeapple.ca) - Admin Analysis', () => {
  test('Explore admin features on old site', async ({ page }) => {
    const analysis: SiteAnalysis = {
      site: 'inventory.limeapple.ca',
      loginSuccess: false,
      features: [],
      navigation: [],
      reports: [],
      timestamp: new Date().toISOString()
    };

    // Navigate to old site
    console.log('Navigating to old inventory site...');
    await page.goto(`${OLD_SITE_BASE}/USA`, { waitUntil: 'networkidle', timeout: 60000 });
    await saveScreenshot(page, 'old-site-initial');

    // Try to find and fill login form
    console.log('Looking for login form...');

    // Check page title and URL
    const title = await page.title();
    console.log(`Page title: ${title}`);
    console.log(`Page URL: ${page.url()}`);

    // Look for login form elements
    const usernameField = page.locator('input[name="username"], input[name="user"], input[type="text"]:first-child, input[id*="user"], input[id*="login"]').first();
    const passwordField = page.locator('input[type="password"], input[name="password"]').first();
    const loginButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();

    try {
      // Wait a bit for page to fully load
      await page.waitForTimeout(2000);

      // Check if we need to login
      if (await usernameField.isVisible({ timeout: 5000 })) {
        console.log('Login form found, attempting login...');
        await usernameField.fill(ADMIN_CREDENTIALS.username);
        await passwordField.fill(ADMIN_CREDENTIALS.password);
        await saveScreenshot(page, 'old-site-login-filled');
        await loginButton.click();
        await page.waitForTimeout(3000);
        analysis.loginSuccess = true;
      } else {
        console.log('No login form visible, may already be logged in or different page structure');
        // Extract what's visible
        const pageInfo = await extractPageInfo(page);
        analysis.navigation = pageInfo;
      }
    } catch (e) {
      console.log('Login attempt failed:', e);
    }

    await saveScreenshot(page, 'old-site-after-login');

    // Extract navigation and features from the page
    const pageElements = await extractPageInfo(page);
    analysis.navigation = pageElements;

    console.log('Page elements found:', pageElements.length);
    pageElements.forEach(el => console.log('  -', el));

    // Try to find admin-specific pages
    const adminPages = [
      '/admin', '/dashboard', '/reports', '/orders', '/products',
      '/customers', '/inventory', '/settings', '/users', '/reps',
      '/analytics', '/sales'
    ];

    for (const adminPath of adminPages) {
      try {
        await page.goto(`${OLD_SITE_BASE}${adminPath}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const status = page.url().includes(adminPath) ? 'found' : 'redirected';
        analysis.features.push({
          name: adminPath,
          url: page.url(),
          found: status === 'found'
        });
        if (status === 'found') {
          await saveScreenshot(page, `old-site-${adminPath.replace('/', '')}`);
        }
      } catch (e) {
        analysis.features.push({
          name: adminPath,
          url: '',
          found: false,
          notes: `Error: ${e}`
        });
      }
    }

    // Save analysis
    fs.writeFileSync(
      path.join(__dirname, 'old-site-analysis.json'),
      JSON.stringify(analysis, null, 2)
    );

    console.log('\nAnalysis saved to old-site-analysis.json');
  });
});

test.describe('New OrderHubNow Site - Admin Analysis', () => {
  test('Explore admin features on new site', async ({ page }) => {
    const analysis: SiteAnalysis = {
      site: 'orderhubnow.com',
      loginSuccess: false,
      features: [],
      navigation: [],
      reports: [],
      timestamp: new Date().toISOString()
    };

    // Navigate to new site admin login
    console.log('Navigating to OrderHubNow admin login...');
    await page.goto(`${NEW_SITE_BASE}/admin/login`, { waitUntil: 'networkidle', timeout: 60000 });
    await saveScreenshot(page, 'new-site-login');

    // Fill login form
    console.log('Looking for login form...');

    try {
      // Look for the login form - could be email or username based
      const usernameField = page.locator('input[name="username"], input[name="email"], input[type="email"], input[type="text"]').first();
      const passwordField = page.locator('input[type="password"]').first();
      const loginButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();

      await usernameField.waitFor({ state: 'visible', timeout: 10000 });
      await usernameField.fill(ADMIN_CREDENTIALS.username);
      await passwordField.fill(ADMIN_CREDENTIALS.password);
      await saveScreenshot(page, 'new-site-login-filled');

      await loginButton.click();
      await page.waitForTimeout(3000);

      // Check if we're logged in
      if (!page.url().includes('/login')) {
        analysis.loginSuccess = true;
        console.log('Login successful!');
      }
    } catch (e) {
      console.log('Login attempt failed:', e);
    }

    await saveScreenshot(page, 'new-site-after-login');

    // If logged in, explore admin pages
    if (analysis.loginSuccess) {
      const adminPages = [
        { path: '/admin', name: 'Dashboard' },
        { path: '/admin/reports', name: 'Reports' },
        { path: '/admin/orders', name: 'Orders' },
        { path: '/admin/products', name: 'Products' },
        { path: '/admin/categories', name: 'Categories' },
        { path: '/admin/inventory', name: 'Inventory' },
        { path: '/admin/customers', name: 'Customers' },
        { path: '/admin/reps', name: 'Sales Reps' },
        { path: '/admin/prepacks', name: 'Prepacks' },
        { path: '/admin/shopify', name: 'Shopify' },
        { path: '/admin/settings', name: 'Settings' }
      ];

      for (const adminPage of adminPages) {
        try {
          console.log(`Exploring ${adminPage.name}...`);
          await page.goto(`${NEW_SITE_BASE}${adminPage.path}`, { waitUntil: 'networkidle', timeout: 30000 });

          const pageInfo = await extractPageInfo(page);
          const screenshotPath = await saveScreenshot(page, `new-site-${adminPage.name.toLowerCase().replace(' ', '-')}`);

          analysis.features.push({
            name: adminPage.name,
            url: adminPage.path,
            found: true,
            screenshot: screenshotPath,
            elements: pageInfo
          });

          console.log(`  Found ${pageInfo.length} elements`);
        } catch (e) {
          console.log(`  Error exploring ${adminPage.name}:`, e);
          analysis.features.push({
            name: adminPage.name,
            url: adminPage.path,
            found: false,
            notes: `Error: ${e}`
          });
        }
      }

      // Explore report types
      const reportTypes = [
        'category-totals', 'po-sold', 'exception', 'cohort-retention',
        'account-potential', 'sku-velocity', 'rep-scorecard',
        'customer-ltv', 'first-to-second'
      ];

      for (const reportType of reportTypes) {
        try {
          console.log(`Exploring report: ${reportType}...`);
          await page.goto(`${NEW_SITE_BASE}/admin/reports?type=${reportType}`, { waitUntil: 'networkidle', timeout: 30000 });
          await saveScreenshot(page, `new-site-report-${reportType}`);
          analysis.reports.push(reportType);
        } catch (e) {
          console.log(`  Error with report ${reportType}:`, e);
        }
      }
    }

    // Extract final navigation
    analysis.navigation = await extractPageInfo(page);

    // Save analysis
    fs.writeFileSync(
      path.join(__dirname, 'new-site-analysis.json'),
      JSON.stringify(analysis, null, 2)
    );

    console.log('\nAnalysis saved to new-site-analysis.json');
  });
});

test.describe('Feature Comparison', () => {
  test('Generate comparison report', async ({ page }) => {
    // Load both analyses if they exist
    const oldAnalysisPath = path.join(__dirname, 'old-site-analysis.json');
    const newAnalysisPath = path.join(__dirname, 'new-site-analysis.json');

    let oldAnalysis: SiteAnalysis | null = null;
    let newAnalysis: SiteAnalysis | null = null;

    if (fs.existsSync(oldAnalysisPath)) {
      oldAnalysis = JSON.parse(fs.readFileSync(oldAnalysisPath, 'utf-8'));
    }

    if (fs.existsSync(newAnalysisPath)) {
      newAnalysis = JSON.parse(fs.readFileSync(newAnalysisPath, 'utf-8'));
    }

    const comparison = {
      generatedAt: new Date().toISOString(),
      oldSite: oldAnalysis,
      newSite: newAnalysis,
      summary: {
        oldSiteFeatureCount: oldAnalysis?.features.length || 0,
        newSiteFeatureCount: newAnalysis?.features.length || 0,
        newSiteReportCount: newAnalysis?.reports.length || 0
      }
    };

    fs.writeFileSync(
      path.join(__dirname, 'comparison-report.json'),
      JSON.stringify(comparison, null, 2)
    );

    console.log('Comparison report generated!');
  });
});
