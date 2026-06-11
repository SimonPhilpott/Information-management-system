import express from 'express';
import { getSpatialGraph } from '../services/graphService.js';
import { scrapeUrlAndGenerateSummary, liveScanSharePointNav } from '../services/scraperService.js';

const router = express.Router();

router.get('/data', async (req, res) => {
  try {
    const sensitivity = parseInt(req.query.sensitivity) || 1;
    const subjectSource = req.query.subjectSource || 'folder';
    console.log(`[GraphAPI] Generating graph data (sensitivity: ${sensitivity}, subjectSource: ${subjectSource})...`);
    const graphData = await getSpatialGraph(sensitivity, subjectSource);
    console.log(`[GraphAPI] Graph generated: ${graphData.nodes.length} nodes, ${graphData.links.length} links.`);
    res.json(graphData);
  } catch (err) {
    console.error('[GraphAPI] ERROR:', err);
    res.status(500).json({ 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

router.post('/scrape', async (req, res) => {
  try {
    const { url, nodeTitle, nodeType } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required.' });
    }
    console.log(`[GraphAPI] Scraping request for "${nodeTitle}" -> ${url}`);
    const content = await scrapeUrlAndGenerateSummary(url, nodeTitle, nodeType);
    res.json({ content });
  } catch (err) {
    console.error('[GraphAPI] Scrape Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/scan-nav', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required.' });
    }
    console.log(`[GraphAPI] Scan navigation request for: ${url}`);
    const items = await liveScanSharePointNav(url);
    res.json({ success: true, items });
  } catch (err) {
    console.error('[GraphAPI] Scan Nav Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
