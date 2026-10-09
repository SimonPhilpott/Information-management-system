import { Router } from 'express';
import http from 'http';
import https from 'https';
import localOnly from '../middleware/localOnly.js';

export const parseSharePointXml = (xmlStr) => {
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

export const flattenSharePointItems = (items, prefix = '') => {
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

export const findNodeInTreeByUrl = (nodes, siteUrl) => {
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

const router = Router();
router.use(localOnly);

// Proxy SharePoint navigation menu state
router.get('/', (req, res) => {
  const siteUrl = req.query.siteUrl;
  if (!siteUrl) {
    return res.status(400).json({ error: 'Missing siteUrl parameter' });
  }

  let targetUrl = String(siteUrl).trim();
  if (targetUrl.endsWith('/')) {
    targetUrl = targetUrl.slice(0, -1);
  }
  targetUrl = `${targetUrl}/_api/navigation/menustate`;

  let targetObj;
  try {
    targetObj = new URL(targetUrl);
  } catch (err) {
    return res.status(400).json({ error: `Invalid URL: ${err.message}` });
  }

  const client = targetObj.protocol === 'https:' ? https : http;

  const request = client.get({
    hostname: targetObj.hostname,
    port: targetObj.port || (targetObj.protocol === 'https:' ? 443 : 80),
    path: targetObj.pathname + targetObj.search,
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  }, (response) => {
    let body = '';
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => {
      res.status(response.statusCode || 200);
      res.setHeader('Content-Type', 'application/json');
      res.send(body);
    });
  });

  request.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
});

export default router;
