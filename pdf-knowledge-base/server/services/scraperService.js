import { GoogleGenerativeAI } from '@google/generative-ai';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import config from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.join(__dirname, '../../playwright_profile');

/**
 * Scrapes a secure SharePoint portal or private corporate intranet URL using Playwright.
 * @param {string} url - The target SharePoint URL.
 * @returns {Promise<string>} Cleaned innerText of the page.
 */
async function scrapeWithPlaywright(url) {
  console.log(`[Playwright] Launching Chromium persistent context for: ${url}`);
  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE_PATH, {
      headless: false, // Keep visible so SSO/MFA works easily on first run
      viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();
    console.log(`[Playwright] Navigating to URL...`);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });

    // Check if we are redirected to Microsoft Login page
    const currentUrl = page.url();
    if (
      currentUrl.includes('login.microsoftonline.com') || 
      currentUrl.includes('login.windows.net') || 
      currentUrl.includes('login.live.com')
    ) {
      console.log(`[Playwright] Login Wall Detected! Waiting up to 3 minutes for SSO / MFA authentication to complete...`);
      // Wait until the page URL redirects back to the sharepoint domain
      await page.waitForURL(u => u.toString().includes('sharepoint.com'), { timeout: 180000 });
      console.log(`[Playwright] Redirected back to SharePoint. Allowing page to settle...`);
      await page.waitForTimeout(8000);
    } else {
      // Just wait a few seconds for SharePoint elements to load
      await page.waitForTimeout(6000);
    }

    console.log(`[Playwright] Extracting raw DOM text...`);
    const scrapedText = await page.evaluate(() => {
      // Clean script, style, and comments
      const scripts = document.querySelectorAll('script, style, iframe, noscript');
      scripts.forEach(s => s.remove());
      return document.body.innerText;
    });

    await context.close();
    return scrapedText;
  } catch (err) {
    console.error(`[Playwright] Scrape Error:`, err);
    if (context) {
      try {
        await context.close();
      } catch (closeErr) {
        console.error(`[Playwright] Close Error:`, closeErr);
      }
    }
    throw err;
  }
}

/**
 * Scrapes a public URL or utilizes Playwright Browser Automation to bypass SSO login walls.
 * @param {string} url - The target URL to synchronize.
 * @param {string} nodeTitle - The title of the node (e.g., "Real Estate").
 * @param {string} nodeType - The classification of the node (e.g., "CONCEPT").
 * @returns {Promise<string>} The raw scraped text content.
 */
export async function scrapeUrlAndGenerateSummary(url, nodeTitle, nodeType) {
  let harvestedText = '';
  let isSharepointOrPrivate = false;

  if (
    url.includes('sharepoint.com') || 
    url.includes('internal') || 
    url.includes('intranet') ||
    url.includes('turntown.sharepoint.com')
  ) {
    isSharepointOrPrivate = true;
  }

  if (isSharepointOrPrivate) {
    try {
      harvestedText = await scrapeWithPlaywright(url);
    } catch (err) {
      console.error(`[Scraper] Playwright scrape failed: ${err.message}.`);
      harvestedText = `[SECURE SYNC ERROR: Playwright failed to scrape the site content: ${err.message}]`;
    }
  } else {
    try {
      console.log(`[Scraper] Attempting direct fetch of public URL: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      let html = await response.text();
      
      // Strip script & style blocks
      html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      
      // Strip all HTML tags
      harvestedText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 15000);
      
      if (
        harvestedText.includes('Sign in') || 
        harvestedText.includes('Microsoft') || 
        response.url?.includes('login')
      ) {
        console.log('[Scraper] Microsoft login wall detected. Re-routing via Playwright.');
        harvestedText = await scrapeWithPlaywright(url);
      }
    } catch (err) {
      console.warn(`[Scraper] Direct fetch failed: ${err.message}. Trying Playwright.`);
      try {
        harvestedText = await scrapeWithPlaywright(url);
      } catch (pwErr) {
        console.error(`[Scraper] Playwright fallback failed:`, pwErr);
        harvestedText = `[SYNC ERROR: Direct fetch and Playwright browser scraper both failed to load site content.]`;
      }
    }
  }

  return harvestedText;
}

/**
 * Scrapes live SharePoint navigation structure using Playwright page-context fetches.
 * @param {string} siteUrl - The root URL of the SharePoint site.
 * @returns {Promise<Array>} Flattened list of child navigation items.
 */
export async function liveScanSharePointNav(siteUrl) {
  let xmlStr = '';
  let isSharepoint = siteUrl.includes('sharepoint.com') || siteUrl.includes('turntown.sharepoint.com');

  const targetEndpoint = siteUrl.endsWith('/') 
    ? `${siteUrl}_api/web/navigation/TopNavigationBar?$expand=Children`
    : `${siteUrl}/_api/web/navigation/TopNavigationBar?$expand=Children`;

  if (isSharepoint) {
    console.log(`[Scraper] Live Playwright Scan for SharePoint nav: ${targetEndpoint}`);
    let context;
    try {
      context = await chromium.launchPersistentContext(PROFILE_PATH, {
        headless: false,
        viewport: { width: 1280, height: 800 }
      });
      const page = await context.newPage();
      
      // Navigate to the main site first to ensure logged in
      await page.goto(siteUrl, { waitUntil: 'load', timeout: 60000 });

      const currentUrl = page.url();
      if (
        currentUrl.includes('login.microsoftonline.com') || 
        currentUrl.includes('login.windows.net') || 
        currentUrl.includes('login.live.com')
      ) {
        console.log(`[Playwright] Login Wall Detected during Scan! Waiting up to 3 minutes for user SSO...`);
        await page.waitForURL(u => u.toString().includes('sharepoint.com'), { timeout: 180000 });
        await page.waitForTimeout(8000);
      } else {
        await page.waitForTimeout(5000);
      }

      // Fetch the XML API inside the page context
      console.log(`[Playwright] Executing API fetch in page context...`);
      xmlStr = await page.evaluate(async (endpoint) => {
        const res = await fetch(endpoint);
        return res.text();
      }, targetEndpoint);

      await context.close();
    } catch (err) {
      console.error(`[Scraper] Playwright navigation scan failed:`, err);
      if (context) {
        try { await context.close(); } catch(e){}
      }
      return localXmlFileFallback(siteUrl);
    }
  } else {
    try {
      const res = await fetch(targetEndpoint);
      xmlStr = await res.text();
    } catch (err) {
      console.warn(`[Scraper] Direct fetch failed for nav scan: ${err.message}`);
      return localXmlFileFallback(siteUrl);
    }
  }

  // Parse and return flat list
  try {
    const parsed = parseSharePointXml(xmlStr);
    return flattenSharePointItems(parsed);
  } catch (parseErr) {
    console.error(`[Scraper] XML Parsing failed:`, parseErr);
    return localXmlFileFallback(siteUrl);
  }
}

// Fallback search of local NAVXML.txt file
function localXmlFileFallback(siteUrl) {
  console.log(`[Scraper] Falling back to local NAVXML.txt offline search for: ${siteUrl}`);
  try {
    const xmlContent = fs.readFileSync('D:/Information management system/NAVXML.txt', 'utf8');
    const parsed = parseSharePointXml(xmlContent);
    const matchedNode = findNodeInTreeByUrl(parsed, siteUrl);
    if (matchedNode && matchedNode.children && matchedNode.children.length > 0) {
      return flattenSharePointItems(matchedNode.children);
    }
  } catch (err) {
    console.error(`[Scraper] Local fallback failed:`, err);
  }
  return [];
}

const parseSharePointXml = (xmlStr) => {
  const items = [];
  let pos = 0;
  while (true) {
    const entryStart = xmlStr.indexOf('<entry>', pos);
    if (entryStart === -1) break;
    
    let entryEnd = -1;
    let depth = 0;
    let scanPos = entryStart;
    while (scanPos < xmlStr.length) {
      const nextOpen = xmlStr.indexOf('<entry>', scanPos);
      const nextClose = xmlStr.indexOf('</entry>', scanPos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        scanPos = nextOpen + 7;
      } else {
        depth--;
        if (depth === 0) {
          entryEnd = nextClose + 8;
          break;
        }
        scanPos = nextClose + 8;
      }
    }
    if (entryEnd === -1) {
      pos = entryStart + 7;
      continue;
    }
    const entryContent = xmlStr.substring(entryStart, entryEnd);
    const titleMatch = entryContent.match(/<d:Title[^>]*>([\s\S]*?)<\/d:Title>/);
    const urlMatch = entryContent.match(/<d:Url[^>]*>([\s\S]*?)<\/d:Url>/);
    const idMatch = entryContent.match(/<d:Id[^>]*>([\s\S]*?)<\/d:Id>/);
    
    if (titleMatch && urlMatch) {
      const title = titleMatch[1].replace(/&amp;/g, '&').trim();
      const url = urlMatch[1].trim();
      const id = idMatch ? idMatch[1].trim() : '';
      
      const item = { id, title, url, children: [] };
      const inlineStart = entryContent.indexOf('<m:inline>');
      const inlineEnd = entryContent.indexOf('</m:inline>');
      if (inlineStart !== -1 && inlineEnd !== -1) {
        const inlineContent = entryContent.substring(inlineStart + 10, inlineEnd);
        item.children = parseSharePointXml(inlineContent);
      }
      items.push(item);
    }
    pos = entryEnd;
  }
  return items;
};

const flattenSharePointItems = (items, prefix = '') => {
  let flat = [];
  items.forEach((item) => {
    const fullTitle = prefix ? `${prefix} > ${item.title}` : item.title;
    if (item.url && item.url !== 'http://linkless.header/') {
      flat.push({
        title: fullTitle,
        url: item.url,
        type: 'CONCEPT'
      });
    }
    if (item.children && item.children.length > 0) {
      flat = flat.concat(flattenSharePointItems(item.children, item.title));
    }
  });
  return flat;
};

const findNodeInTreeByUrl = (nodes, siteUrl) => {
  const targetPath = siteUrl.toLowerCase().replace(/https?:\/\/turntown\.sharepoint\.com/, '').trim();
  for (const node of nodes) {
    const nodePath = node.url.toLowerCase().replace(/https?:\/\/turntown\.sharepoint\.com/, '').trim();
    if (nodePath && targetPath && (nodePath === targetPath || nodePath.includes(targetPath) || targetPath.includes(nodePath))) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const found = findNodeInTreeByUrl(node.children, siteUrl);
      if (found) return found;
    }
  }
  return null;
};
