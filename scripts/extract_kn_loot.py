# Extracts the Spoils & Loot chapter of Ker Nethalas (Gravebound Edition, pp. 213-241) into the beta's tables:
# every "D<n> TITLE" table as rows {lo, hi, t}, plus the Relics with their item type, powers and description.
# usage: python scripts/extract_kn_loot.py  -> src/components/DndBeta/kn/lootTables.json
import re, json, pymupdf

PDF = "G:/My Drive/BOOKS/D&D/Ker Nathalas/Ker Nethalas_ Into the Midnight Throne.pdf"
doc = pymupdf.open(PDF)

def clean(s):
    s = s.replace('\ufffd', 'f').replace('\u2019', "'").replace('\u2013', '-').replace('\u00ad', '').replace('\u20b5', ' coins').replace('\u00a2', ' coins')
    s = re.sub(r'\s+', ' ', s).strip()
    return s.replace(' coins.', ' coins.').replace('- ', '-') if False else s

ROW = re.compile(r'^(\d{1,3})(?:-(\d{1,3}))?(?:\s+(.*))?$')
HEAD = re.compile(r'^D(\d+)(?:\s+(.+))?$')

def tables_on(pages):
    out = {}
    for pi in pages:
        lines = [l.strip() for l in doc[pi].get_text('text', flags=0).split('\n')]
        lines = [l for l in lines if l and not re.match(r'^(Chapter VI|Ker Nethalas - Gravebound|\d{3}$)', l)]
        i = 0; cur = None
        while i < len(lines):
            l = lines[i]
            h = HEAD.match(l)
            if h and (h.group(2) is None or h.group(2).isupper() or '(PAGE' in h.group(2)):
                title = h.group(2) or ''
                j = i + 1
                while j < len(lines) and not ROW.match(lines[j]) and (lines[j].isupper() or not title):
                    title = (title + ' ' + lines[j]).strip(); j += 1
                title = re.sub(r'\s*\(CONTINUED\)', '', clean(title))
                cur = out.setdefault(title, {'die': int(h.group(1)), 'page': pi + 1, 'rows': []})
                i = j; continue
            r = ROW.match(l)
            if cur is not None and r and int(r.group(1)) <= cur['die'] and (not cur['rows'] or int(r.group(1)) > cur['rows'][-1]['hi'] or (int(r.group(1)) == 1 and cur['die'] == 100)):
                lo = int(r.group(1)); hi = int(r.group(2) or lo); text = r.group(3) or ''
                j = i + 1
                while j < len(lines) and not ROW.match(lines[j]) and not HEAD.match(lines[j]):
                    text += ' ' + lines[j]; j += 1
                if lo == 0: lo = 100
                cur['rows'].append({'lo': lo if lo else 100, 'hi': 100 if hi == 0 else hi, 't': clean(text)})
                i = j; continue
            i += 1
    return out

T = tables_on(range(212, 233))
T.update(tables_on([233]))

# Relics (pp. 234-241): names from the D20 table, then each block in the same order
names = [r['t'] for r in T.get('RELICS', {}).get('rows', [])]
blocks = []
# by font: Cambria-Bold = title and "Item Type", a Wingdings bullet starts a power, plain Cambria continues it,
# Cambria-Italic is the description (a short italic tail of an unfinished power still belongs to it)
for pi in range(234, 241):
    for blk in doc[pi].get_text('dict', flags=0)['blocks']:
        for ln in blk.get('lines', []):
            sp = ln['spans']; text = ''.join(x['text'] for x in sp); f = sp[0]['font']
            if not text.strip() or 'Angelrhapsody' in f: continue
            if text.startswith('Item Type:'): blocks.append({'type': clean(text[10:]), 'powers': [], 'desc': ''}); continue
            if not blocks or 'Bold' in f: continue
            cur = blocks[-1]
            if 'Wingdings' in f: cur['powers'].append(clean(text[1:])); continue
            if 'Italic' not in f and cur['powers'] and not cur['desc']: cur['powers'][-1] += ' ' + clean(text); continue
            if cur['powers'] and not cur['desc'] and not re.search(r'[.!)]\s*$', cur['powers'][-1]) and len(text.strip()) < 30 and re.search(r'(be|by|for|of|to|deal|dealing|the)\s*$', cur['powers'][-1]):
                cur['powers'][-1] += ' ' + clean(text); continue
            cur['desc'] = (cur['desc'] + ' ' + clean(text)).strip()
relics = [{'name': n, **b} for n, b in zip(names, blocks)]

keep = {}
for k, v in T.items():
    if not v['rows']: continue
    keep[k] = v
json.dump({'source': 'Ker Nethalas: Into the Midnight Throne, Gravebound Edition (March 2026), pp. 213-241', 'tables': keep, 'relics': relics},
          open('src/components/DndBeta/kn/lootTables.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
for k, v in keep.items(): print(f"{k:42s} D{v['die']:<4} p{v['page']} rows {len(v['rows'])} cover {sum(r['hi'] - r['lo'] + 1 for r in v['rows'])}")
print(len(relics), 'relics;', [ (r['name'], r['type'], len(r['powers'])) for r in relics[:4]])
