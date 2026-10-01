import { Router } from 'express';
import { getWeather, getHome, setHome, listPlaces, addPlace, removePlace, phrasebook } from '../services/weatherService.js';

// Weather page (/ims/weather): forecast for home or a saved place, the home location, saved places and
// the phrasebook Ims describes the weather from.
const router = Router();
const fail = (res, err, code = 500) => res.status(code).json({ success: false, error: err.message });

router.get('/', async (req, res) => {
  try {
    const weather = await getWeather({ location: req.query.location || '', days: Number(req.query.days) || 16, hourly: true });
    res.json({ success: !weather.error, weather });
  } catch (err) { fail(res, err); }
});

router.get('/places', (req, res) => {
  const places = listPlaces();
  // options: for the day report's "also read out" drop-down
  res.json({ success: true, home: getHome(), places, options: [{ value: '', label: 'None - home only' }, ...places.map((p) => ({ value: p.name, label: p.name }))] });
});

router.put('/home', async (req, res) => {
  try { res.json({ success: true, home: await setHome(req.body?.query) }); } catch (err) { fail(res, err, 400); }
});

router.post('/places', async (req, res) => {
  try { await addPlace(req.body?.query); res.json({ success: true, places: listPlaces() }); } catch (err) { fail(res, err, 400); }
});

router.delete('/places/:name', (req, res) => {
  res.json({ success: true, places: removePlace(req.params.name) });
});

router.get('/phrases', (req, res) => {
  res.json({ success: true, phrases: phrasebook() });
});

export default router;
