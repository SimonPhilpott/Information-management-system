// Homebrew (beta): Find - what you can make with what you've got. Pick what's to hand from the groups (or type it),
// and the recipe book shows every drink that uses it, the best matches first, with the matching ingredients shown.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PRODUCE_GROUPS, famKey, wordRe } from './brewData';
import { findMatches, groupCards, wantedOf, withAlso } from './logic';
import { Icon, IconButton, FilterChip, Btn } from './ui';
import { ShelfCard } from './Shelf';
import { useIngredientPictures } from './ingredientPics';
import { canonicalizeMain, normIngredient } from './canonical';

// Every ingredient in Ingredient pictures (admin), tidied into the thing itself: the part of a recipe line before its
// first comma or dash, without "fresh", "dried" and the like, merged by the same name rules as the server
// ("fresh thyme - during the mash rest" -> Thyme). Then sorted into the finder's groups by what it is - the longest
// matching word in the groups' lists that comes last wins ("pineapple weed" is a herb, "honey malt" a malt) - else by its kind in the
// recipes (malt, hops, honey, sugar, spice, fruit), and anything left goes in Everything else.
const PREP = /^(?:freshly picked|fresh|dried|dry|ripe|frozen|chopped|whole|organic|wild|raw|crushed|sliced|peeled|grated|ground|large|small|finely|roughly|washed|unwaxed|pitted|stoned|toasted|unsweetened|good|best|clean|picked|handful of|a handful of|some)\s+/i;
const QTY = /^[\d½¼¾⅓⅔.,/\s-]+(?:kg|g|lb|lbs|oz|l|ml|tsp|tbsp|cups?|pints?|gallons?|x)?\.?\s+(?:of\s+)?/i;
function cleanName(name) {
  let h = String(name || '').replace(/\(.*?\)/g, '').split(/,|\s[-–—]\s|;|:/)[0].trim();
  for (let i = 0; i < 4; i++) h = h.replace(QTY, '').replace(PREP, '');
  const c = (canonicalizeMain(h) || h).trim();
  return c ? c[0].toUpperCase() + c.slice(1) : '';
}
const ALL_ITEMS = PRODUCE_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, gid: g.id })));
const BY_KIND = { malt: 'grain', hops: 'hops', honey: 'sweet', sugar: 'sweet', spice: 'spice', fruit: 'fruit' };
function groupOf(label, types = []) {
  const t = label.toLowerCase();
  // the word a name ends on says what it is ("honey malt" is a malt), so the match that ends last wins, then the longest
  let best = null;
  let bestEnd = -1;
  for (const it of ALL_ITEMS) {
    const m = it.re.exec(t);
    if (!m) continue;
    const end = m.index + m[0].trimEnd().length;
    if (end > bestEnd || (end === bestEnd && it.w.length > best.w.length)) { best = it; bestEnd = end; }
  }
  if (best) return { gid: best.gid, icon: best.icon };
  for (const k of types) if (BY_KIND[k]) return { gid: BY_KIND[k], icon: null };
  return { gid: 'other', icon: null };
}
// an ingredient to pick: the same card as Ingredient pictures (admin) - its picture, its name and how many drinks use it
function IngTile({ ing, on, onClick, delay = 0 }) {
  return (
    <button type="button" className={`adm-tile sl enter ${on ? 'on' : ''}`} style={{ animationDelay: `${delay}ms` }} onClick={onClick} aria-pressed={on} data-w={ing.w}>
      <span className="pic">{ing.key ? <img src={`/api/homebrew/picture/${ing.key}`} alt="" loading="lazy" /> : <span aria-hidden="true">{ing.icon}</span>}</span>
      <span className="tx">
        <span className="nm">{ing.label}</span>
        <span className="st">{ing.n} {ing.n === 1 ? 'recipe' : 'recipes'}</span>
      </span>
      {on && <span className="mine tick-in"><Icon n="check" size={18} /></span>}
    </button>
  );
}

const GROUPS = [...PRODUCE_GROUPS.map(({ id, label, icon }) => ({ id, label, icon })), { id: 'other', label: 'Everything else', icon: '🧪' }];

export default function Find({ recipes, words, setWords, selectedId, onOpen, onFav, catLabel, hrefFor, headerEnd, scrollRef }) {
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(''); // every category closed to start with
  const listing = useIngredientPictures();
  const recipeText = useMemo(() => recipes.map((r) => ({ r, t: [r.name, ...withAlso(r.ingredients).map((g) => String(g.name || '').replace(/\(.*?\)/g, ''))].join(' | ') })), [recipes]);
  // every ingredient from the admin list, tidied, de-duplicated and grouped; each with its picture and how many
  // drinks in the recipe book use it (the same matching the results use, so the number is what you'll get)
  const groups = useMemo(() => {
    const chips = new Map(); // norm -> chip
    for (const e of listing?.ingredients || []) {
      const label = cleanName(e.name);
      if (!label || label.length > 40) continue;
      const norm = normIngredient(label);
      const prev = chips.get(norm);
      if (prev) {
        if (!prev.key && e.hasImage) prev.key = e.currentKey;
        e.types?.forEach((t) => prev.types.add(t));
        continue;
      }
      chips.set(norm, { w: label.toLowerCase(), label, key: e.hasImage ? e.currentKey : null, types: new Set(e.types || []) });
    }
    // the picture chosen for the tidied name itself beats one borrowed from a longer line
    for (const e of listing?.ingredients || []) { const c = chips.get(e.norm); if (c && e.hasImage) c.key = e.currentKey; }
    const out = new Map(GROUPS.map((g) => [g.id, { ...g, items: [] }]));
    for (const c of chips.values()) {
      const re = wordRe(c.w);
      const n = new Set(recipeText.filter((x) => re.test(x.t)).map((x) => famKey(x.r))).size;
      if (!n) continue;
      const { gid, icon } = groupOf(c.label, [...c.types]);
      out.get(gid).items.push({ ...c, icon: icon || GROUPS.find((g) => g.id === gid).icon, n });
    }
    return [...out.values()].map((g) => ({ ...g, items: g.items.sort((a, b) => a.w.localeCompare(b.w)) })).filter((g) => g.items.length);
  }, [listing, recipeText]);
  const toggle = (w) => setWords(words.includes(w) ? words.filter((x) => x !== w) : [...words, w]);
  const addTyped = () => { const add = wantedOf(typed).filter((w) => !words.includes(w)); if (add.length) setWords([...words, ...add]); setTyped(''); };
  const matches = useMemo(() => (words.length ? findMatches(recipes, words) : []), [recipes, words]);
  const hitMap = new Map(matches.map((x) => [x.b.id, x]));
  // a drink's best match is its version that uses the most of what's picked; the drinks that use them all come first
  // (and get a gold border), then the rest by how many they use
  const best = (c) => c.members.reduce((top, m) => ((hitMap.get(m.id)?.n || 0) > (hitMap.get(top.id)?.n || 0) ? m : top), c.rep);
  const cards = groupCards(matches.map((x) => x.b), true)
    .map((c, i) => ({ c, i, n: hitMap.get(best(c).id)?.n || 0 }))
    .sort((x, y) => y.n - x.n || x.i - y.i)
    .map(({ c, n }) => ({ ...c, gold: words.length > 1 && n === words.length }));
  const all = words.length > 1 ? cards.filter((c) => c.gold).length : null;

  // ---- moving around: the drinks found sit at the top, the ingredients to pick from below them ----
  // Picking an ingredient never moves the page: the tile you tapped stays exactly where it was on screen, however much
  // the list of drinks above it grew or shrank. (The browser's own scroll anchoring is off while Find is showing, so
  // the two don't both correct it.)
  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return undefined;
    const was = el.style.overflowAnchor;
    el.style.overflowAnchor = 'none'; // eslint-disable-line react-hooks/immutability
    return () => { el.style.overflowAnchor = was; };
  }, [scrollRef]);
  const anchor = useRef(null);
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = scrollRef?.current;
    anchor.current = null;
    if (!a || !el || !a.el.isConnected) return;
    el.scrollTop += a.el.getBoundingClientRect().top - a.top; // eslint-disable-line react-hooks/immutability
  }, [words, scrollRef]);
  const pick = (w, gid, e) => {
    const tile = e?.currentTarget;
    if (tile) anchor.current = { el: tile, top: tile.getBoundingClientRect().top };
    if (!words.includes(w)) setLast({ w, gid });
    toggle(w);
  };

  // the button at the bottom right: "N drinks" takes you up to them; once you're looking at them it becomes
  // "X filters", which takes you back down to the ingredient you picked last
  const resultsRef = useRef(null);
  const groupsRef = useRef(null);
  const [atResults, setAtResults] = useState(false);
  const [last, setLast] = useState(null);
  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return undefined;
    const check = () => {
      const g = groupsRef.current;
      if (!g) return;
      // looking at the drinks: the ingredients haven't reached the middle of the screen yet
      const box = el.getBoundingClientRect();
      setAtResults(g.getBoundingClientRect().top > box.top + box.height / 2);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    return () => el.removeEventListener('scroll', check);
  }, [scrollRef, words.length]);
  const headH = () => scrollRef?.current?.querySelector('.shelf-head')?.offsetHeight || 0;
  const scrollToEl = (target, where) => {
    const el = scrollRef?.current;
    if (!el || !target) return;
    const top = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: where === 'center' ? top - el.clientHeight / 2 + 40 : top - headH() - 8, behavior: reduce ? 'auto' : 'smooth' });
  };
  const toDrinks = () => scrollToEl(resultsRef.current, 'top');
  const toFilters = () => {
    const w = last && words.includes(last.w) ? last : null;
    const go = () => {
      const tile = w && scrollRef?.current?.querySelector(`[data-w="${CSS.escape(w.w)}"]`);
      scrollToEl(tile || groupsRef.current, tile ? 'center' : 'top');
    };
    if (w && open !== w.gid) { setOpen(w.gid); requestAnimationFrame(() => requestAnimationFrame(go)); } else go();
  };

  return (
    <>
      <div className="shelf-head gutter">
        <form className="search" onSubmit={(e) => { e.preventDefault(); addTyped(); }}>
          <Icon n="leaf" />
          <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="What have you got? e.g. apples, rhubarb" aria-label="What have you got?" enterKeyHint="search" />
          {typed && <IconButton icon="add" label="Add" onClick={addTyped} />}
          {headerEnd}
        </form>
        {words.length > 0 && (
          // wraps on to more lines, so every ingredient picked and Clear are always in view
          <div className="chips wrap">
            {words.map((w) => (
              <button key={w} type="button" className="chip sl on input" onClick={() => toggle(w)} aria-label={`Remove ${w}`}>
                {w}<span className="trail"><Icon n="close" size={18} /></span>
              </button>
            ))}
            <Btn kind="text" onClick={() => setWords([])}>Clear</Btn>
          </div>
        )}
      </div>
      <div className="gutter" style={{ paddingTop: 8 }}>
        {words.length > 0 && (
          <div ref={resultsRef}>
            <div className="sect" style={{ display: 'block' }}>{cards.length} {cards.length === 1 ? 'drink uses' : 'drinks use'} {words.length > 1 ? 'some of these' : words[0]}{all != null && <span className="n">· {all} use{all === 1 ? 's' : ''} them all</span>}</div>
            {cards.length > 0 ? (
              <div className="grid">
                {cards.slice(0, 120).map((c, i) => (
                  <ShelfCard key={c.key} card={{ ...c, href: hrefFor(c.rep) }} index={i} fresh selected={c.members.some((m) => m.id === selectedId)}
                    onOpen={onOpen} onFav={onFav} hits={hitMap.get(best(c).id)?.hits} catLabel={catLabel} gold={c.gold} />
                ))}
              </div>
            ) : (
              <div className="empty"><h3>Nothing uses that yet</h3><p>Try another ingredient, or fewer of them.</p></div>
            )}
          </div>
        )}
        <div ref={groupsRef}>
          {words.length > 0
            ? <div className="sect">Add more ingredients</div>
            : <p className="muted" style={{ padding: '8px 0 12px' }}>Pick an ingredient to see how you can use it. Each one shows how many drinks in the recipe book use it.</p>}
          <div className="groups">
            {groups.map((g) => (
              <div key={g.id} className={`group ${open === g.id ? 'open' : ''}`}>
                <button type="button" className="sl" onClick={() => setOpen(open === g.id ? '' : g.id)} aria-expanded={open === g.id}>
                  <span className="em" aria-hidden="true">{g.icon}</span>{g.label}<span className="c">{g.items.filter((i) => words.includes(i.w)).length ? `${g.items.filter((i) => words.includes(i.w)).length} picked · ` : ''}{g.items.length}</span><span className="chev"><Icon n="down" /></span>
                </button>
                {open === g.id && (
                  <div className="adm-grid find-grid">
                    {g.items.map((i, n) => <IngTile key={i.w} ing={i} on={words.includes(i.w)} onClick={(e) => pick(i.w, g.id, e)} delay={Math.min(n, 16) * 20} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div style={{ height: 120 }} />
        {words.length > 0 && (
          // stays at the bottom right of the screen while you scroll (sticky, at the end of the page)
          <div className="find-jump">
            {atResults
              ? <button type="button" className="fab sl" onClick={toFilters}><Icon n="tune" /><span className="lbl">{words.length} {words.length === 1 ? 'filter' : 'filters'}</span></button>
              : <button type="button" className="fab sl" onClick={toDrinks}><Icon n="up" /><span className="lbl">{cards.length} {cards.length === 1 ? 'drink' : 'drinks'}</span></button>}
          </div>
        )}
      </div>
    </>
  );
}
