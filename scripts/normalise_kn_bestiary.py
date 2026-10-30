# Turns the raw stat blocks (scripts/extract_kn_bestiary.py) into the engine's bestiary: numbers parsed, level
# adaptation, armour by location, traits, and each action's mechanics read from its own wording.
# usage: python scripts/normalise_kn_bestiary.py  -> src/components/DndBeta/kn/bestiary.json
import re, json, sys
sys.path.insert(0, 'scripts')
import importlib.util
spec = importlib.util.spec_from_file_location('ex', 'scripts/extract_kn_bestiary.py'); ex = importlib.util.module_from_spec(spec); spec.loader.exec_module(ex)

raw = json.load(open('src/components/DndBeta/kn/bestiary.raw.json', encoding='utf-8'))
OVERSEER_PAGES = {181: 'Carnage Devourer', 183: 'Dreadlord', 185: 'Glacial Burrower', 187: 'Gorehoof', 188: 'Infernal Archon', 191: 'Infernal Tormentor', 193: 'Pyroclasmic Possessor', 195: 'Veilshifter', 197: 'Venomcloud Siren', 199: 'Zephyrous Shadow'}
DTYPES = 'Acid|Arcane|Bludgeoning|Cold|Fire|Force|Holy|Infernal|Lightning|Necrotic|Piercing|Poison|Psychic|Slashing'
CHECKS = 'Athletics|Dodge|Endurance|Resolve|Spellward|Acrobatics|Perception|Reason|Body|Stealth|Mind'
CONDS = 'Prone|Restrained|Bleeding|Poisoned|Burning|Stunned|Frightened|Dazed|Blinded|Paralyzed|Sickened|Charmed|Freezing|Concealed'

def ints(s): return [int(x) for x in re.findall(r'\d+', s or '')]

def desc_of(page):
    words = [w for w in ex.doc[page - 1].get_text('words') if 25 < w[1] < ex.doc[page - 1].rect.height - 40]
    ls = ex.lines_of(words)
    txt = [l['t'] for l in ls if not re.search(r'Gravebound|Chapter V', l['t'])]
    return ex.repairs(page - 1)(ex.fix(' '.join(txt[1:])))

def traits_of(s):
    s = re.sub(r'\s+', ' ', s or '').strip()
    if s in ('', '-'): return [], []
    parts = []
    for p in s.split(', '):
        if parts and (p[:1].islower() or p.startswith('non-')): parts[-1] += ', ' + p
        else: parts.append(p)
    traits, extra = [], []
    for p in parts:
        m = re.match(r'^(Penetrating|Ruthlessness)\s*\((\d+)\)$', p)
        if m: traits.append({'name': m.group(1), 'n': int(m.group(2))}); continue
        if p in ('Pack', 'Swift', 'Savage', 'Venomous', 'Alert', 'Frightening', 'Horrifying'): traits.append({'name': p}); continue
        extra.append(p)
    return traits, extra

def armor_of(s):
    s = (s or '').replace('Forequart ers', 'Forequarters').replace('Fore quarters', 'Forequarters').replace('Hind quarters', 'Hindquarters')
    m = re.match(r'^(\d+)\s*\((.+)\)$', s.strip())
    if not m: return {}
    n = int(m.group(1)); locs = m.group(2)
    if re.search(r'all', locs, re.I): return {'*': n}
    return {l.strip(): n for l in locs.split(',')}

def level_of(s):
    out = []
    for at, body in re.findall(r'After level (\d+):\s*(.*?)(?=After level \d+:|$)', s or ''):
        e = {'at': int(at), 'health': 0, 'dmg': [], 'combat': 0, 'magicRes': 0, 'mind': 0, 'traits': [], 'notes': []}
        for item in [x.strip() for x in body.split(',') if x.strip()]:
            if m := re.match(r'^\+(\d+) Health', item): e['health'] += int(m.group(1))
            elif m := re.match(r'^\+(\d*D\d+(?:\+\d+)?|\d+) damage', item): e['dmg'].append(m.group(1))
            elif m := re.match(r'^\+(\d+) Combat Skill', item): e['combat'] += int(m.group(1))
            elif m := re.match(r'^\+(\d+) Magic Resistance', item): e['magicRes'] += int(m.group(1))
            elif m := re.match(r'^\+(\d+) Mind', item): e['mind'] += int(m.group(1))
            else:
                t, x = traits_of(re.sub(r'^(gains?|the|and)\s+', '', item, flags=re.I).replace(' Trait', ''))
                e['traits'] += t; e['notes'] += x
        out.append(e)
    return out

def action_of(roll, text, die):
    lo, _, hi = roll.partition('-'); rolls = list(range(int(lo), int(hi or lo) + 1))
    name, _, rest = text.partition(':')
    tag = 'physical' if '(Physical)' in name else 'magical' if '(Magical)' in name else None
    name = re.sub(r'\s*\((Physical|Magical)\)', '', name).strip()
    a = {'rolls': rolls, 'name': name, 'tag': tag, 'text': rest.strip()}
    m = re.search(rf'(\d*D\d+(?:\s*\+\s*\d+)?|\b\d+\b) ({DTYPES}) damage', rest)
    if m: a['dmg'] = m.group(1).replace(' ', '').lower(); a['dtype'] = m.group(2)
    m = re.search(rf'\b({CHECKS})\b(?:/\w+)? (?:opposed )?check', rest)
    if m: a['save'] = {'Body': 'Athletics', 'Mind': 'Perception'}.get(m.group(1), m.group(1))
    if re.search(r'half (as much )?damage|takes? half|half the damage|half as much', rest, re.I): a['half'] = True
    conds = []
    for c, n in re.findall(rf'\b({CONDS})\b(?: \((\d+)\))?', rest):
        if c == 'Prone' and 'knocked Prone' not in rest and 'Prone' not in rest: continue
        if not any(x['name'] == c for x in conds): conds.append({'name': c, 'n': int(n) if n else 1})
    if conds: a['conds'] = conds
    if re.search(r'all (characters|creatures)|each creature|creatures within|all targets|every creature', rest, re.I): a['area'] = True
    if m := re.search(r'(?:recovers?|regains?|heals?) (\d*D\d+|\d+) Health', rest): a['heal'] = m.group(1).lower()
    if re.search(r'summons?', rest, re.I): a['summon'] = True
    if re.search(r'(new|another|additional|extra) turn', rest, re.I): a['extraTurn'] = True
    if not a.get('dmg') and not a.get('save') and not conds and not a.get('heal'): a['manual'] = True
    return a

out = []
for r in raw:
    page = r['page']; name = r['name']; overseer = page in OVERSEER_PAGES
    if page == 189: continue
    if overseer: name = OVERSEER_PAGES[page]
    desc = r['desc'] if not overseer or r['desc'] else desc_of(page - 1)
    if overseer and page != 188: desc = desc_of(page - 1)
    hm = re.match(r'^(\d+)(?:\+(\d+) per)?', r['health'] or '0')
    t_traits, t_extra = traits_of(r['traits'])
    anat = re.match(r'^([A-Za-z ]+?)\s*\(\s*(.+?)\)', r['anatomy'] or '')
    num = r['number'].strip()
    c = {
        'name': name, 'page': page, 'desc': desc, 'type': [x.strip() for x in r['type'].split(',') if x.strip()],
        'number': int(num) if num.isdigit() else num.replace(' ', '').lower(),
        'mind': (ints(r['mind']) or [0])[0], 'endurance': (ints(r['endurance']) or [0])[0], 'body': (ints(r['body']) or [0])[0],
        'health': int(hm.group(1)) if hm else 0, 'healthPerLevel': int(hm.group(2)) if hm and hm.group(2) else 0,
        'anatomy': anat.group(1).strip() if anat else None, 'weak': anat.group(2).strip() if anat else None,
        'armor': armor_of(r['armor']), 'combat': (ints(r['combat']) or [0])[0], 'magicRes': (ints(r['magicRes']) or [0])[-1],
        'spoils': r['spoils'], 'traits': t_traits, 'special': t_extra, 'level': level_of(r['level']),
        'actionsDie': r.get('actionsDie', 'D6'), 'actions': [action_of(a['roll'], a['text'], r.get('actionsDie', 'D6')) for a in r['actions']],
        'overseer': overseer,
    }
    out.append(c)

# the Infernal Archon's actions and its Lesser Demons are on the page after its stat block (p. 189)
words = [w for w in ex.doc[188].get_text('words')]
t_act = ex.find(words, 'ACTIONS'); t_type = ex.find(words, 'TYPE', t_act[1])
nums = sorted([w for w in words if t_act[3] < w[1] < t_type[1] and w[0] < 80 and re.match(r'^\d$', w[4])], key=lambda w: w[1])
lines = ex.lines_of([w for w in words if t_act[3] < w[1] < t_type[1] - 1 and w[0] > 80])
idx = [min(range(len(lines)), key=lambda i: abs(lines[i]['y'] - (n[1] + n[3]) / 2)) for n in nums]
cuts = [0] + [max(range(a, b), key=lambda k: lines[k + 1]['y'] - lines[k]['y']) + 1 for a, b in zip(idx, idx[1:])] + [len(lines)]
archon = next(c for c in out if c['name'] == 'Infernal Archon')
rep189 = ex.repairs(188)
archon['actions'] = [action_of(n[4], rep189(ex.fix(' '.join(l['t'] for l in lines[cuts[i]:cuts[i + 1]]))), 'D6') for i, n in enumerate(nums)]
# a two-word name can start on the line above its number; mend the names the split cut short
FULL = {'Veil': 'Shadow Veil', 'Conjuration': 'Demonic Conjuration', 'Barrage': 'Infernal Barrage', 'Rift': 'Shadow Rift', 'of Annihilation': 'Vortex of Annihilation'}
for a in archon['actions']: a['name'] = FULL.get(a['name'], a['name'])
out.append({'name': 'Lesser Demon', 'page': 189, 'desc': 'Summoned by the Infernal Archon to fight beside it.', 'type': ['Demon'], 'number': 1, 'mind': 40, 'endurance': 40, 'body': 20, 'health': 2, 'healthPerLevel': 0,
            'anatomy': 'Humanoid', 'weak': 'Head', 'armor': {}, 'combat': 40, 'magicRes': 30, 'spoils': '', 'traits': [], 'special': ['Restored by Fire damage'], 'level': [], 'actionsDie': 'D6',
            'actions': [action_of('1-6', 'Demonic Slash (Physical): The Lesser Demon lashes with its claws at a target, dealing D4 Slashing damage.', 'D6')], 'overseer': False, 'summoned': True})

json.dump(out, open('src/components/DndBeta/kn/bestiary.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(len(out), 'creatures;', sum(1 for c in out if c['overseer']), 'Overseers')
acts = [a for c in out for a in c['actions']]
print(len(acts), 'actions;', sum(1 for a in acts if a.get('manual')), 'left to the player;', sum(1 for a in acts if a.get('dmg')), 'with damage')
for c in out:
    if not c['actions'] or c['health'] == 0 or c['combat'] == 0: print('CHECK', c['name'], c['health'], c['combat'], len(c['actions']))
