/**
 * check_locations.cjs
 * Cross-checks the official T&T location list against mesh_authority.js
 */
const fs = require('fs');
const path = require('path');

// Official list from the user
const OFFICIAL_LIST = {
  'North America': ['Canada', 'United States'],
  'Asia - Pacific': ['Australia', 'Greater China', 'India', 'Indonesia', 'Japan', 'Korea', 'Malaysia', 'New Zealand', 'Philippines', 'Singapore', 'Taiwan', 'Thailand', 'Vietnam'],
  'Europe': ['Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Czech Republic', 'Denmark', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland', 'Italy', 'Luxembourg', 'Norway', 'Poland', 'Portugal', 'Romania', 'Serbia', 'Slovakia', 'Spain', 'Sweden', 'Switzerland', 'The Netherlands', 'Türkiye', 'United Kingdom'],
  'Middle East': ['Egypt', 'Kingdom of Saudi Arabia', 'Qatar', 'United Arab Emirates'],
  'Latin America': ['Argentina', 'Brazil', 'Chile', 'Colombia', 'Mexico', 'Peru', 'Uruguay'],
  'Africa': ['Botswana', 'Kenya', 'Mozambique', 'Nigeria', 'Rwanda', 'South Africa', 'Tanzania', 'Uganda', 'Zambia', 'Zimbabwe'],
};

// Load nodes
const maText = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'mesh_authority.js'), 'utf8');
const match  = maText.match(/export const MESHES\s*=\s*(\[[\s\S]*?\]);/);
const nodes  = eval(match[1]);

// All location/region titles (lowercase for fuzzy matching)
const allTitles = nodes.map(n => ({ id: n.id, title: n.title, lower: n.title.toLowerCase().trim(), parentId: n.parentId }));

const missing = [];
const found   = [];

for (const [region, locs] of Object.entries(OFFICIAL_LIST)) {
  for (const loc of locs) {
    const lower = loc.toLowerCase().trim();
    const match = allTitles.find(n =>
      n.lower === lower ||
      n.lower.includes(lower) ||
      lower.includes(n.lower)
    );
    if (match) {
      found.push({ region, loc, id: match.id, title: match.title, parentId: match.parentId });
    } else {
      missing.push({ region, loc });
    }
  }
}

console.log(`\n✅ FOUND (${found.length}):`);
found.forEach(f => console.log(`  [${f.region}] "${f.loc}" → id: ${f.id} (parent: ${f.parentId})`));

console.log(`\n❌ MISSING (${missing.length}):`);
missing.forEach(m => console.log(`  [${m.region}] "${m.loc}"`));

if (missing.length === 0) {
  console.log('  None! All locations are present.');
}
