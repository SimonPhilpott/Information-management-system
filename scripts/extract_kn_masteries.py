# Extracts the 20 Masteries of Ker Nethalas (Gravebound Edition, pp. 21-61): name, flavour, Mastery Feature, the five
# Tier Abilities (action, cost, text) and the D6 "Where did you train?" table.
# The book sets its headings in a small-caps font with no Unicode map, so those glyphs come out as U+FFFD. The glyph
# numbers are stable, so they are decoded with a key learned from the 20 Relic names (known from the Relics table).
# usage: python scripts/extract_kn_masteries.py  -> src/components/DndBeta/kn/masteries.json
import re, json, collections, pymupdf

PDF = "G:/My Drive/BOOKS/D&D/Ker Nathalas/Ker Nethalas_ Into the Midnight Throne.pdf"
doc = pymupdf.open(PDF)

def learn_key():
    relics = [r['name'] for r in json.load(open('src/components/DndBeta/kn/lootTables.json', encoding='utf-8'))['relics']]
    heads = []
    for pi in range(234, 241):
        for s in doc[pi].get_texttrace():
            if s['font'] == 'Cambria-Bold' and any(c[0] == 0xfffd for c in s['chars']): heads.append(s['chars'])
    key = collections.defaultdict(collections.Counter)
    for ch, name in zip(heads, relics):
        if len(ch) != len(name): continue
        for c, l in zip(ch, name):
            if c[0] == 0xfffd: key[c[1]][l] += 1
    return {g: c.most_common(1)[0][0] for g, c in key.items()}

K = learn_key()
K.update({41: 'k', 37: '&', 96: 'f'})  # letters no Relic name contains
UNKNOWN = collections.Counter()

def text_of(s):
    bold = 'Bold' in s['font']; out = ''
    for c in s['chars']:
        if c[0] != 0xfffd: out += chr(c[0]); continue
        if bold:
            l = K.get(c[1])
            if l is None: UNKNOWN[c[1]] += 1; l = '\u2047'
            out += l
        else: out += 'f'  # the body text's lost glyph is the f-ligature
    return out.replace('\u2019', "'").replace('\u2013', '-')

def lines_of(pi):
    spans = [s for s in doc[pi].get_texttrace() if 'Angelrhapsody' not in s['font']]
    rows = []
    for s in sorted(spans, key=lambda s: (round(s['bbox'][1]), s['bbox'][0])):
        y = s['bbox'][1]
        if rows and abs(rows[-1]['y'] - y) < 3: rows[-1]['s'].append(s)
        else: rows.append({'y': y, 's': [s]})
    for r in rows:
        r['s'].sort(key=lambda s: s['bbox'][0])
        r['t'] = ''.join(text_of(s) for s in r['s']).strip()
        r['f'] = r['s'][0]['font']; r['size'] = r['s'][0]['size']
    return rows

def clean(s): return re.sub(r'\s+', ' ', s).replace(' .', '.').strip()

out = []
for pi in range(21, 61):
    rows = lines_of(pi)
    title = next((r for r in rows if 'OldCeltiberian' in r['f']), None)
    if not title: continue
    m = {'name': clean(title['t']), 'page': pi + 1, 'blurb': '', 'feature': None, 'tiers': [], 'training': []}
    m['blurb'] = clean(' '.join(r['t'] for r in rows if 'Italic' in r['f'] and r['size'] > 11))
    body = [r for r in rows if r['size'] < 11]
    cur = None; feat = None
    for r in body:
        t = r['t']
        if re.match(r'^Mastery Feature:', t):
            name, _, rest = t[len('Mastery Feature:'):].partition('.')
            feat = {'name': clean(name), 'text': clean(rest)}; m['feature'] = feat; cur = None; continue
        tm = re.match(r'^Tier (\d) - (.+)$', t)
        if tm:
            cur = {'tier': int(tm.group(1)), 'name': clean(tm.group(2)), 'action': '', 'cost': '', 'text': ''}; m['tiers'].append(cur); feat = None; continue
        if cur is not None:
            if not cur['action'] and 'Italic' in r['f']:
                a, _, c = t.partition('Cost')
                cur['action'] = clean(a).rstrip('.'); cur['cost'] = clean(c.lstrip(': '))
                continue
            cur['text'] = clean(cur['text'] + ' ' + t); continue
        if feat is not None: feat['text'] = clean(feat['text'] + ' ' + t)
    # the facing page: D6 "Where did you train?"
    nxt = lines_of(pi + 1)
    if any('HERE' in r['t'] for r in nxt):
        entries = []
        for r in nxt:
            b = next((s for s in r['s'] if 'Bold' in s['font']), None)
            if b and r['s'][0] is b or (b and r['s'][0]['font'].startswith('Cambria-Bold')):
                name = clean(text_of(b)).rstrip(':')
                entries.append({'name': name, 'text': clean(r['t'][len(text_of(b).strip()):].lstrip(': '))})
            elif entries and r['f'].startswith('Cambria') and r['size'] < 11: entries[-1]['text'] = clean(entries[-1]['text'] + ' ' + r['t'])
        m['training'] = [{'n': i + 1, **e} for i, e in enumerate(entries[:6])]
        for e in m['training']: e['text'] = re.sub(r'^(?:' + re.escape(e['name']) + r'\s*:?\s*)', '', e['text'])
    out.append(m)

for m in out:
    for t in m['tiers']: t['name'] = t['name'][:1].upper() + t['name'][1:]
    for e in m['training']:
        if e['text'][:1].islower(): e['text'] = f"{e['name']} {e['text']}"
json.dump(out, open('src/components/DndBeta/kn/masteries.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
for m in out:
    print(m['page'], m['name'], '|', m['feature']['name'] if m['feature'] else None, '|', [t['name'] for t in m['tiers']], '|', len(m['training']))
print('undecoded glyphs:', dict(UNKNOWN))
