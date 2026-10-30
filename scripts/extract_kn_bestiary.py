# Extracts every Ker Nethalas stat block (Gravebound Edition, chapter V, pp. 136-203) by word position:
# name, description, the two stat rows, trait(s), level adaptation and the D6 actions table.
# usage: python scripts/extract_kn_bestiary.py  -> src/components/DndBeta/kn/bestiary.json
import re, json, sys, pymupdf

PDF = "G:/My Drive/BOOKS/D&D/Ker Nathalas/Ker Nethalas_ Into the Midnight Throne.pdf"
doc = pymupdf.open(PDF)

def fix(s):
    s = re.sub(r'7(?=[A-Za-z])', 'f', s)
    s = re.sub(r'(?<=[a-z])`(?=[a-z])', 'f', s)
    return s.replace('\ufb01', 'fi').replace('\ufb02', 'fl').replace('\u00ad', '').replace('\u2019', "'").replace('\u2013', '-').strip()

def lines_of(words, x0=0, x1=9999, y0=0, y1=9999):
    ws = sorted([w for w in words if x0 <= w[0] < x1 and y0 <= (w[1] + w[3]) / 2 < y1], key=lambda w: ((w[1] + w[3]) / 2, w[0]))
    out = []
    for w in ws:
        yc = (w[1] + w[3]) / 2
        if out and abs(out[-1]['y'] - yc) < 3.2: out[-1]['w'].append(w)
        else: out.append({'y': yc, 'w': [w]})
    for l in out:
        l['w'].sort(key=lambda w: w[0]); l['t'] = ' '.join(w[4] for w in l['w'])
    return out

def find(words, text, after_y=-1):
    c = [w for w in words if w[4] == text and w[1] > after_y]
    return sorted(c, key=lambda w: (w[1], w[0]))[0] if c else None

def columns(words, heads, y_top, y_bot):
    # values sit under their heading: assign each word to the nearest heading by x centre
    cols = {h[4]: [] for h in heads}
    centers = [((h[0] + h[2]) / 2, h[4]) for h in heads]
    for w in words:
        yc = (w[1] + w[3]) / 2
        if not (y_top < yc < y_bot): continue
        xc = (w[0] + w[2]) / 2
        name = min(centers, key=lambda c: abs(c[0] - xc))[1]
        cols[name].append(w)
    return {k: fix(' '.join(x[4] for x in sorted(v, key=lambda w: (round(w[1]), w[0])))) for k, v in cols.items()}

# The book's fi/fl/ff ligatures come out as an unmapped glyph that stands for "f"; the word splitter drops it and
# breaks the word in two ("in licting"). The page's plain text keeps the glyph, so it says how to mend each word.
def repairs(pi):
    t = doc[pi].get_text('text', flags=0)
    pairs = set(re.findall(r'(\w*)�(\w+)', t))
    def rep(s):
        for left, right in sorted(pairs, key=lambda p: -len(p[0] + p[1])):
            if left: s = re.sub(rf'\b{re.escape(left)} {re.escape(right)}\b', left + 'f' + right, s)
            else: s = re.sub(rf'(^|(?<=\s)){re.escape(right)}\b', 'f' + right, s)
        return s
    return rep

def parse_page(pi):
    page = doc[pi]; words = page.get_text('words'); H = page.rect.height
    words = [w for w in words if 25 < w[1] < H - 40]
    t_type = find(words, 'TYPE'); t_num = find(words, 'NUMBER')
    if not t_type or not t_num or abs(t_type[1] - t_num[1]) > 4: return None
    row1 = [w for w in words if abs(w[1] - t_type[1]) < 4 and w[4] in ('TYPE', 'NUMBER', 'MIND', 'ENDURANCE', 'BODY', 'HEALTH')]
    t_hit = find(words, 'HIT', t_type[1] + 5) or find(words, 'ARMOR', t_type[1] + 5)
    t_armor = find(words, 'ARMOR', t_type[1] + 5)
    row2y = t_armor[1] if t_armor else t_hit[1]
    row2 = [w for w in words if abs(w[1] - row2y) < 14 and w[4] in ('HIT', 'ARMOR', 'COMBAT', 'MAGIC', 'SPOILS')]
    # the second row's headings run over two lines (HIT LOCATION, COMBAT SKILL, MAGIC RESISTANCE)
    row2_bot = max(w[3] for w in words if abs(w[1] - row2y) < 14 and w[4] in ('HIT', 'ARMOR', 'COMBAT', 'MAGIC', 'SPOILS', 'LOCATION', 'SKILL', 'RESISTANCE'))
    v1 = columns(words, row1, t_type[3] + 1, min(w[1] for w in row2 + [t_hit]) - 1)
    t_trait = find(words, 'TRAIT', row2y + 5) or find(words, 'TRAITS', row2y + 5)
    t_level = find(words, 'LEVEL', row2y + 5)
    v2 = columns(words, row2, row2_bot + 1, (t_trait or t_level)[1] - 1)
    # name and description: above the stat rows
    head = lines_of(words, 0, 9999, 0, t_type[1] - 1)
    name = fix(head[0]['t']) if head else '?'
    desc = fix(' '.join(l['t'] for l in head[1:]))
    traits = ''
    if t_trait:
        traits = fix(' '.join(l['t'] for l in lines_of(words, 0, 9999, t_trait[3] + 1, (t_level[1] if t_level else H) - 1)))
    t_act = find(words, 'ACTIONS', (t_level or t_trait or t_armor)[1])
    level = ''
    if t_level:
        level = fix(' '.join(l['t'] for l in lines_of(words, 0, 9999, t_level[3] + 1, (t_act[1] if t_act else H) - 1)))
        level = re.sub(r'^ADAPTATION\s*', '', level)
    actions = []
    if t_act:
        d6 = [w for w in words if w[4] in ('D6', 'D8', 'D10', 'D4', 'D12') and abs(w[1] - t_act[1]) < 4]
        die = d6[0][4] if d6 else 'D6'
        col = (d6[0][2] + 2) if d6 else 70
        nums = sorted([w for w in words if w[1] > t_act[3] and w[0] < col + 10 and re.match(r'^\d{1,2}(-\d{1,2})?$', w[4])], key=lambda w: w[1])
        lines = lines_of([w for w in words if w[1] > t_act[3] and w[0] > col], 0, 9999)
        lines = [l for l in lines if not re.search(r'Ker Nethalas - Gravebound|Chapter V', l['t'])]
        if nums:
            idx = [min(range(len(lines)), key=lambda i: abs(lines[i]['y'] - (n[1] + n[3]) / 2)) for n in nums]
            cuts = [0]
            for a, b in zip(idx, idx[1:]):
                if b <= a: cuts.append(a + 1); continue
                gaps = [(lines[k + 1]['y'] - lines[k]['y'], k) for k in range(a, b)]
                mx = max(g for g, _ in gaps); ks = [k for g, k in gaps if abs(g - mx) < .6]
                cuts.append(ks[len(ks) // 2] + 1)
            cuts.append(len(lines))
            for i, n in enumerate(nums):
                actions.append({'roll': n[4], 'text': fix(' '.join(l['t'] for l in lines[cuts[i]:cuts[i + 1]]))})
        actions_die = die
    rep = repairs(pi)
    desc = rep(desc); traits = rep(traits); level = rep(level)
    for a in actions: a['text'] = rep(a['text'])
    return {'page': pi + 1, 'name': name.title().replace("'S", "'s"), 'desc': desc, 'type': v1.get('TYPE', ''), 'number': v1.get('NUMBER', ''),
            'mind': v1.get('MIND', ''), 'endurance': v1.get('ENDURANCE', ''), 'body': v1.get('BODY', ''), 'health': v1.get('HEALTH', ''),
            'anatomy': v2.get('HIT', ''), 'armor': v2.get('ARMOR', ''), 'combat': v2.get('COMBAT', ''), 'magicRes': v2.get('MAGIC', ''), 'spoils': v2.get('SPOILS', ''),
            'traits': traits, 'level': level, 'actionsDie': actions_die if t_act else 'D6', 'actions': actions}

if __name__ == '__main__':
    pages = range(135, 204)
    out = []
    for pi in pages:
        try:
            r = parse_page(pi)
            if r: out.append(r)
        except Exception as e:
            print('page', pi + 1, 'failed', e)
    json.dump(out, open('src/components/DndBeta/kn/bestiary.raw.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(len(out), 'stat blocks')
    for r in out: print(r['page'], r['name'], '|', r['type'], '|', r['number'], r['mind'], r['endurance'], r['body'], r['health'], '|', r['anatomy'], '|', r['armor'], '|', r['combat'], r['magicRes'], '|', r['traits'][:40], '|', len(r['actions']))
