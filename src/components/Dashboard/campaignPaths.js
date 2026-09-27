// Campaign Manager addresses. Each game has its own tab under /campaigns:
//   /campaigns/lotr              Lord of the Rings LCG campaigns
//   /campaigns/lotr/<id>         one campaign
//   /campaigns/lotr/decks        the decks
//   /campaigns/lotr/decks/<id>   one deck
// The old deck builder addresses (/ims/decks/...) still work - they're turned into these.
export const CAMPAIGN_GAMES = [{ key: 'lotr', name: 'Lord of the Rings LCG' }, { key: 'ahlcg', name: 'Arkham Horror LCG' }];

export function isCampaignPath(p) {
  return p === '/campaigns' || p.startsWith('/campaigns/') || p.startsWith('/ims/decks');
}

export function canonicalCampaignPath(p) {
  let m;
  if ((m = p.match(/^\/ims\/decks\/deck\/(\d+)/))) return `/campaigns/lotr/decks/${m[1]}`;
  if ((m = p.match(/^\/ims\/decks\/campaign\/(\d+)/))) return `/campaigns/lotr/${m[1]}`;
  if (p.startsWith('/ims/decks/decks')) return '/campaigns/lotr/decks';
  if (p.startsWith('/ims/decks')) return '/campaigns/lotr';
  const g = p.match(/^\/campaigns\/([a-z]+)/);
  if (!g || !CAMPAIGN_GAMES.some((x) => x.key === g[1])) return `/campaigns/${CAMPAIGN_GAMES[0].key}`;
  return p.replace(/\/+$/, '');
}
