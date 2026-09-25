// Carb lookups from Open Food Facts (free, no key; UK products first). Returns carbs per 100 g
// and per serving for the best matches, plus a typical figure across them, so Ims can work out
// the grams for what was eaten.
const UA = 'IMS/1.0 (personal desk assistant)';
const cache = new Map();
const r1 = (x) => Math.round(x * 10) / 10;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Search-a-licious (search.openfoodfacts.org) is the current search service; the older
// cgi/search.pl often answers 503, so it's only the fallback.
async function search(query, ukOnly) {
  const fields = 'product_name,brands,nutriments,serving_size,serving_quantity,countries_tags';
  try {
    const q = ukOnly ? `${query} countries_tags:"en:united-kingdom"` : query;
    const res = await fetch(`https://search.openfoodfacts.org/search?${new URLSearchParams({ q, page_size: '20', fields })}`, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA } });
    if (res.ok) return ((await res.json()).hits || []).map((h) => ({ ...h, brands: Array.isArray(h.brands) ? h.brands.join(',') : h.brands }));
  } catch (_) { /* fall through */ }
  const params = new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '20', fields });
  if (ukOnly) { params.set('tagtype_0', 'countries'); params.set('tag_contains_0', 'contains'); params.set('tag_0', 'united-kingdom'); }
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA } });
    if (res.ok) return (await res.json()).products || [];
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error('Open Food Facts is not answering right now.');
}

export async function lookUpFood(query) {
  const q = String(query || '').trim().slice(0, 80);
  if (!q) throw new Error('Say what the food is.');
  const hit = cache.get(q.toLowerCase());
  if (hit && Date.now() - hit.at < 24 * 3600000) return hit.data;

  let products = await search(q, true);
  if (products.length < 3) products = products.concat(await search(q, false));
  const items = products.map((p) => {
    const n = p.nutriments || {};
    const per100 = Number(n.carbohydrates_100g);
    if (!Number.isFinite(per100) || per100 < 0 || per100 > 100) return null;
    const servingG = Number(p.serving_quantity) || null;
    const perServing = Number.isFinite(Number(n.carbohydrates_serving)) ? Number(n.carbohydrates_serving) : servingG ? (per100 * servingG) / 100 : null;
    return {
      name: [p.brands?.split(',')[0], p.product_name].filter(Boolean).join(' - ').slice(0, 80),
      carbsPer100g: r1(per100), servingSize: p.serving_size || null, servingG, carbsPerServing: perServing != null ? r1(perServing) : null,
      sugarsPer100g: Number.isFinite(Number(n.sugars_100g)) ? r1(Number(n.sugars_100g)) : null,
    };
  }).filter(Boolean).slice(0, 12);

  const data = {
    query: q, source: 'Open Food Facts', matches: items.length,
    typicalCarbsPer100g: items.length ? r1(median(items.map((i) => i.carbsPer100g))) : null,
    typicalServing: (() => { const s = items.filter((i) => i.servingG && i.carbsPerServing != null); return s.length ? { grams: r1(median(s.map((i) => i.servingG))), carbs: r1(median(s.map((i) => i.carbsPerServing))) } : null; })(),
    rangePer100g: items.length ? [Math.min(...items.map((i) => i.carbsPer100g)), Math.max(...items.map((i) => i.carbsPer100g))] : null,
    products: items.slice(0, 6),
    howToUse: 'Carbs eaten = carbs per serving x servings, or carbs per 100 g x grams eaten / 100. If no serving size is given, use a typical UK portion weight (e.g. a medium slice of bread is about 36 g, a thick slice about 44 g, one Weetabix about 19 g) and say what you assumed. If the matches vary a lot (a wide range per 100 g) or portion size is unclear, ask ONE short question first (e.g. white or brown, medium or thick slices, how big a bowl). Then say the total you worked out and call logCarbs.',
  };
  cache.set(q.toLowerCase(), { at: Date.now(), data });
  return data;
}
