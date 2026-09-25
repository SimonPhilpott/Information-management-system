import { Router } from 'express';
import { listSources, addSource, updateSource, deleteSource, sourceItems, getReportNews } from '../services/newsService.js';

const router = Router();
const fail = (res, err, code = 500) => res.status(code).json({ success: false, error: err.message });

router.get('/sources', (req, res) => { try { res.json({ success: true, sources: listSources() }); } catch (err) { fail(res, err); } });
router.post('/sources', async (req, res) => { try { res.json({ success: true, ...(await addSource(req.body || {})) }); } catch (err) { fail(res, err, 400); } });
router.patch('/sources/:id', async (req, res) => { try { res.json({ success: true, source: await updateSource(req.params.id, req.body || {}) }); } catch (err) { fail(res, err, 400); } });
router.delete('/sources/:id', (req, res) => { try { res.json({ success: deleteSource(req.params.id) }); } catch (err) { fail(res, err); } });
router.get('/sources/:id/items', async (req, res) => { try { res.json({ success: true, items: await sourceItems(req.params.id) }); } catch (err) { fail(res, err, 502); } });
router.get('/report', async (req, res) => { try { res.json({ success: true, items: await getReportNews() }); } catch (err) { fail(res, err); } });

export default router;
