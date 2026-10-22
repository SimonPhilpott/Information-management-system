// Homebrew (beta): the shelf - My brews, the Recipe book and Favourites. A search bar and filter chips at the top,
// the Next up card when a brew needs something, then a gallery of vessel cards that load in as you scroll.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Vessel from './Vessel';
import {
  look, colourOf, sweetOf, strengthOf, WINE_COLOURS, SWEETNESS, ACIDITY, FIZZ, FLAVOUR_TAGS, STATUS_WORD, famKey, ingText,
} from './brewData';
import {
  passes, groupCards, sortCards, filterCount, searchText, activityOf, ACTIVE, RECIPE_SORTS, BREW_SORTS, EMPTY_FILTERS, relDay,
} from './logic';
import {
  Icon, IconButton, Btn, FilterChip, MenuChip, Sheet, RangeSlider, useInView, useCountUp, useMenu, Menu, Spinner, Popover, PickRow,
} from './ui';

const PAGE = 36;
// a picture for each taste option, to match the Type and Flavour options (sparkling's is the classic view's own)
const TASTE_EMOJI = { dry: '🍂', medium: '🍐', sweet: '🍬', soft: '🍑', fresh: '🍏', tart: '🍋', still: '💧', sparkling: '🫧' };
export const tintOf = (b) => `linear-gradient(180deg, ${(b.liquid || look(b.category).liquid)}38, ${(b.liquid || look(b.category).liquid)}10)`;

// ---- one card: the vessel on a tint of the drink's colour, then what it is ----
export function ShelfCard({ card, index = 0, selected, onOpen, onFav, hits, catLabel, fresh, gold = false }) {
  const b = card.rep;
  const many = card.members.length > 1;
  const art = useRef(null);
  const visible = useInView(art);
  const strengths = card.members.map(strengthOf).filter((v) => v != null);
  const lo = strengths.length ? Math.min(...strengths) : null;
  const hi = strengths.length ? Math.max(...strengths) : null;
  const est = card.members.every((m) => !m.calc?.abv && !m.calc?.potentialAbv);
  const wine = colourOf(b);
  const wc = wine ? WINE_COLOURS.find((w) => w.id === wine) : null;
  const sweets = SWEETNESS.filter((s) => card.members.some((m) => sweetOf(m) === s.id));
  const flavs = FLAVOUR_TAGS.filter((f) => card.members.some((m) => (m.flavours || []).includes(f.id)));
  const progress = b.calc?.attenuation != null ? Math.max(0, Math.min(100, b.calc.attenuation)) : null;
  const statusTag = b.isRecipe ? (many ? `${card.members.length} versions` : null) : (b.status === 'fermenting' ? STATUS_WORD.fermenting : STATUS_WORD[b.status] || b.status);
  const open = (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; e.preventDefault(); onOpen(b, art.current); };
  return (
    <a href={card.href} onClick={open} className={`gcard sl ${selected ? 'sel' : ''} ${gold ? 'gold' : ''} ${fresh ? 'enter' : ''}`} style={fresh ? { animationDelay: `${Math.min(index, 12) * 40}ms` } : undefined}
      aria-label={`${many ? b.family : b.name}${statusTag ? `, ${statusTag}` : ''}`}>
      <div className={`art ${visible ? '' : 'paused'}`} ref={art} data-art={card.members.map((m) => m.id).join(' ')} style={{ background: tintOf(b) }}>
        {b.banner && <img className="banner" src={`/api/homebrew/picture/${b.banner}`} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        {statusTag && <span className="tl">{statusTag}</span>}
        <FavButton on={b.favourite} onToggle={(e) => { e.preventDefault(); e.stopPropagation(); onFav(b); }} />
        <Vessel category={b.category} status={b.status} isRecipe={b.isRecipe} size={84} wine={wine} liquid={b.liquid} exactColour={Boolean(b.liquidChoice)} pics={b.mainPics} ingredients={b.ingredients} fizz={b.fizz}
          activity={activityOf(b)} fillIn={fresh && visible} tight />
        {hi != null && <span className={`abv num ${statusTag ? 'below' : ''}`} title={est ? 'Likely strength, estimated from the sugar and yeast' : 'Strength'}>{est ? '~' : ''}{lo === hi ? <>{lo}<small>%</small></> : <>{lo}<small>%</small> –<br />{hi}<small>%</small></>}</span>}
      </div>
      <div className="info">
        <span className="n">{many ? b.family : b.name}</span>
        <span className="st">{b.style || catLabel(b.category)}</span>
        {hits?.length > 0 && <span className="tags">{hits.slice(0, 3).map((g, i) => <span key={i} className="tag hit">{ingText(g).slice(0, 34)}</span>)}</span>}
        {!hits?.length && (wc || sweets.length > 0 || flavs.length > 0) && (
          <span className="tags">
            {wc && <span className="tag"><span className="dot" style={{ background: wc.liquid }} />{wc.label}</span>}
            {sweets.slice(0, 2).map((s) => <span key={s.id} className="tag">{s.label}</span>)}
            {flavs.length > 0 && <span className="tag emo" title={flavs.map((f) => f.label).join(', ')}>{flavs.slice(0, 3).map((f) => <span key={f.id}>{f.emoji}</span>)}</span>}
          </span>
        )}
        {!b.isRecipe && (
          <span className="st" style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <span>{b.calc?.daysSinceStart != null && ACTIVE.includes(b.status) ? `Day ${b.calc.daysSinceStart}` : b.bottledOn ? `Bottled ${relDay(new Date(b.bottledOn).getTime())}` : b.startedOn ? `Started ${relDay(new Date(b.startedOn).getTime())}` : 'Not started'}</span>
            {b.rating ? <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--primary)', fontWeight: 700 }}><Icon n="star" size={18} />{b.rating}</span> : null}
          </span>
        )}
        {!b.isRecipe && b.status === 'fermenting' && progress != null && <span className="bar" title={`${progress}% of the sugar eaten so far`}><i style={{ width: `${progress}%` }} /></span>}
      </div>
    </a>
  );
}

// the heart: pops, with a small burst, when you add a favourite
export function FavButton({ on, onToggle, className = 'fav' }) {
  const [pop, setPop] = useState(0);
  return (
    <IconButton label={on ? 'Remove from favourites' : 'Add to favourites'} className={className} on={on}
      onClick={(e) => { if (!on) setPop(Date.now()); onToggle(e); }} style={on ? { color: '#e11d48' } : undefined}>
      <span key={pop} className={pop ? 'pop' : ''} style={{ display: 'inline-flex', position: 'relative' }}>
        <Icon n={on ? 'fav' : 'favo'} />
        {pop > 0 && Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return <span key={i} className="burst" style={{ '--bx': `${Math.cos(a) * 20}px`, '--by': `${Math.sin(a) * 20}px` }} />;
        })}
      </span>
    </IconButton>
  );
}

function SkeletonGrid({ n = 6 }) {
  return <div className="grid">{Array.from({ length: n }, (_, i) => <div key={i} className="skel" style={{ height: 268 }} />)}</div>;
}

// the gallery, loading another page of cards whenever you near the bottom
function Gallery({ cards, selectedId, onOpen, onFav, hitMap, catLabel, hrefFor, scrollRoot }) {
  const [limit, setLimit] = useState(PAGE);
  const seen = useRef(new Set());
  const sentinel = useRef(null);
  useEffect(() => { setLimit(PAGE); }, [cards.length]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= cards.length) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setLimit((l) => l + PAGE); }, { root: scrollRoot?.current || null, rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, cards.length, scrollRoot]);
  const shown = cards.slice(0, limit);
  let fresh = 0;
  return (
    <>
      <div className="grid">
        {shown.map((c) => {
          const isNew = !seen.current.has(c.key);
          if (isNew) seen.current.add(c.key);
          return (
            <ShelfCard key={c.key} card={{ ...c, href: hrefFor(c.rep) }} index={isNew ? fresh++ : 0} fresh={isNew}
              selected={c.members.some((m) => m.id === selectedId)} onOpen={onOpen} onFav={onFav} hits={hitMap?.get(c.rep.id)?.hits} catLabel={catLabel} />
          );
        })}
      </div>
      {limit < cards.length && <div ref={sentinel} className="sentinel" style={{ display: 'grid', placeItems: 'center', padding: 24, color: 'var(--primary)' }}><Spinner /></div>}
    </>
  );
}

// ---- Next up: the one job a brew needs now, with the button that does it ----
function NextUp({ jobs, onJob, onOpen }) {
  const [all, setAll] = useState(false);
  if (!jobs.length) return null;
  const [job, ...rest] = jobs;
  const b = job.brew;
  return (
    <div className="nextup" role="region" aria-label="Next up">
      {b.banner && <img className="nextup-bg" src={`/api/homebrew/picture/${b.banner}`} alt="" aria-hidden="true" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <div style={{ flex: "0 1 auto", minWidth: 0 }}>
        <div className="k">Next up</div>
        <div className="h">{job.title}</div>
        <div className="d">{job.detail}</div>
        <div className="acts">
          <Btn kind="filled" icon={job.kind === 'log' ? 'chart' : job.kind === 'taste' ? 'wine' : 'check'} onClick={() => onJob(job)}>{job.action}</Btn>
          <Btn kind="text" onClick={() => onOpen(b)}>Open</Btn>
        </div>
        {rest.length > 0 && (
          all ? (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rest.map((j) => (
                <button key={j.brew.id + j.kind} type="button" className="sl" style={{ textAlign: 'left', padding: '8px 0', borderRadius: 8, display: 'flex', gap: 12, alignItems: 'center' }} onClick={() => onJob(j)}>
                  <Icon n={j.kind === 'log' ? 'chart' : j.kind === 'taste' ? 'wine' : 'check'} size={20} />
                  <span style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>{j.title}</b><br /><span style={{ opacity: 0.85 }}>{j.detail}</span></span>
                </button>
              ))}
            </div>
          ) : <button type="button" className="more sl" style={{ borderRadius: 8, padding: '4px 0' }} onClick={() => setAll(true)}>{rest.length} more thing{rest.length === 1 ? '' : 's'} to do</button>
        )}
      </div>
      <div className="art" aria-hidden="true">
        <Vessel category={b.category} status={b.status} isRecipe={false} size={100} wine={colourOf(b)} liquid={b.liquid} exactColour={Boolean(b.liquidChoice)} pics={b.mainPics} ingredients={b.ingredients} activity={activityOf(b)} />
      </div>
    </div>
  );
}

function Stat({ value, label, decimals = 0 }) {
  const v = useCountUp(typeof value === 'number' ? value : null, { decimals });
  return <div className="stat"><span className="v num">{typeof value === 'number' ? v : value}</span><span className="k">{label}</span></div>;
}

// ---- the filter sheet: type, taste and strength; each choice shows how many you'd get ----
function FilterSheet({ open, onClose, pool, texts, filters, setFilters, categories, isRecipes, focus, sort, setSort }) {
  const body = useRef(null);
  useEffect(() => {
    if (!open || !focus) return;
    const t = setTimeout(() => body.current?.querySelector(`[data-sec="${focus}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120);
    return () => clearTimeout(t);
  }, [open, focus]);
  const count = (f, skip) => {
    const list = pool.filter((b) => passes(f, b, { skip, text: texts.get(b.id) }));
    return isRecipes ? new Set(list.map(famKey)).size : list.length;
  };
  const toggle = (key, v) => setFilters({ ...filters, [key]: filters[key].includes(v) ? filters[key].filter((x) => x !== v) : [...filters[key], v] });
  const strengths = pool.filter((b) => passes({ ...filters, abv: null }, b, { text: texts.get(b.id) })).map(strengthOf).filter((v) => v != null);
  const min = strengths.length ? Math.floor(Math.min(...strengths)) : 0;
  const max = strengths.length ? Math.ceil(Math.max(...strengths)) : 20;
  const total = count(filters);
  const typeTiles = [['all', 'All types', '🍾'], ...WINE_COLOURS.map((w) => [w.id, `${w.label} wine`, w.emoji]), ...categories.map((c) => [c.id, c.label, look(c.id).emoji])];
  const sorts = isRecipes ? RECIPE_SORTS : BREW_SORTS;
  return (
    <Sheet open={open} onClose={onClose} title={isRecipes ? 'Filter recipes' : 'Filter brews'}
      actions={filterCount(filters) > 0 ? <Btn kind="text" onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q, fav: filters.fav })}>Reset</Btn> : null}
      footer={<Btn kind="filled" big wide onClick={onClose}>Show {total} {isRecipes ? (total === 1 ? 'drink' : 'drinks') : (total === 1 ? 'brew' : 'brews')}</Btn>}>
      <div ref={body} className="fsheet">
        <section data-sec="sort">
          <h3 className="t-ts muted" style={{ marginBottom: 4 }}>Sort by</h3>
          <div className="chips wrap">{sorts.map(([v, l]) => <FilterChip key={v} on={sort === v} onClick={() => setSort(v)}>{l}</FilterChip>)}</div>
        </section>
        <section data-sec="type">
          <h3 className="t-ts muted" style={{ marginBottom: 4 }}>Type</h3>
          <div className="chips wrap">
            {typeTiles.map(([id, l, em]) => {
              const n = id === filters.cat ? total : count({ ...filters, cat: id });
              if (!n && id !== filters.cat) return null;
              return <FilterChip key={id} on={filters.cat === id} lead={em} count={n} onClick={() => setFilters({ ...filters, cat: filters.cat === id ? 'all' : id })}>{l}</FilterChip>;
            })}
          </div>
        </section>
        <section data-sec="sweet">
          <h3 className="t-ts muted" style={{ marginBottom: 4 }}>Sweetness</h3>
          <div className="chips wrap">{SWEETNESS.map((s) => <FilterChip key={s.id} lead={TASTE_EMOJI[s.id]} on={filters.sweets.includes(s.id)} count={count({ ...filters, sweets: [s.id] })} onClick={() => toggle('sweets', s.id)}>{s.label}</FilterChip>)}</div>
        </section>
        <section data-sec="acid">
          <h3 className="t-ts muted" style={{ marginBottom: 4 }}>Acidity</h3>
          <div className="chips wrap">{ACIDITY.map((s) => <FilterChip key={s.id} lead={TASTE_EMOJI[s.id]} on={filters.acids.includes(s.id)} count={count({ ...filters, acids: [s.id] })} onClick={() => toggle('acids', s.id)}>{s.label}</FilterChip>)}</div>
        </section>
        <section data-sec="fizz">
          <h3 className="t-ts muted" style={{ marginBottom: 4 }}>Fizz</h3>
          <div className="chips wrap">{FIZZ.map((s) => <FilterChip key={s.id} lead={TASTE_EMOJI[s.id]} on={filters.fizzes.includes(s.id)} count={count({ ...filters, fizzes: [s.id] })} onClick={() => toggle('fizzes', s.id)}>{s.label}</FilterChip>)}</div>
        </section>
        <section data-sec="flav">
          <h3 className="t-ts muted" style={{ marginBottom: 4 }}>Flavour <span className="t-bs">(each one you pick narrows it further)</span></h3>
          <div className="chips wrap">{FLAVOUR_TAGS.map((s) => <FilterChip key={s.id} lead={s.emoji} on={filters.flavs.includes(s.id)} count={count({ ...filters, flavs: [...new Set([...filters.flavs, s.id])] })} onClick={() => toggle('flavs', s.id)}>{s.label}</FilterChip>)}</div>
        </section>
        {max > min && (
          <section data-sec="abv">
            <RangeSlider label="Strength" min={min} max={max} value={filters.abv ? [Math.max(min, filters.abv[0]), Math.min(max, filters.abv[1])] : [min, max]}
              onChange={([a, z]) => setFilters({ ...filters, abv: a <= min && z >= max ? null : [a, z] })} />
          </section>
        )}
      </div>
    </Sheet>
  );
}

// ---- a filter chip's dropdown (tablet and desktop): just that filter's options, each with how many it would show ----
function FilterDropdown({ drop, onClose, pool, texts, filters, setFilters, categories, isRecipes }) {
  const open = Boolean(drop);
  const key = drop?.key;
  const count = (f) => {
    const list = pool.filter((b) => passes(f, b, { text: texts.get(b.id) }));
    return isRecipes ? new Set(list.map(famKey)).size : list.length;
  };
  const toggle = (k, v) => setFilters({ ...filters, [k]: filters[k].includes(v) ? filters[k].filter((x) => x !== v) : [...filters[k], v] });
  const total = open ? count(filters) : 0;
  const noun = isRecipes ? (total === 1 ? 'drink' : 'drinks') : (total === 1 ? 'brew' : 'brews');
  const foot = (clear, on) => (
    <div className="pfoot">
      <span className="t-bs muted num">{total} {noun}</span>
      <span style={{ display: 'flex' }}>
        {on && <Btn kind="text" onClick={clear}>Clear</Btn>}
        <Btn kind="text" onClick={onClose}>Done</Btn>
      </span>
    </div>
  );
  let body = null;
  if (key === 'type') {
    const tiles = [['all', 'All types', '🍾'], ...WINE_COLOURS.map((w) => [w.id, `${w.label} wine`, w.emoji]), ...categories.map((c) => [c.id, c.label, look(c.id).emoji])];
    body = (
      <>
        {tiles.map(([id, l, em]) => {
          const n = id === filters.cat ? total : count({ ...filters, cat: id });
          if (!n && id !== filters.cat) return null;
          return <PickRow key={id} lead={em} on={filters.cat === id} count={n} onClick={() => { setFilters({ ...filters, cat: id }); onClose(); }}>{l}</PickRow>;
        })}
      </>
    );
  } else if (key === 'sweet') {
    body = (
      <>
        <p className="t-ls muted" style={{ padding: '4px 16px', textTransform: 'uppercase' }}>Sweetness</p>
        {SWEETNESS.map((s) => <PickRow key={s.id} multi lead={TASTE_EMOJI[s.id]} on={filters.sweets.includes(s.id)} count={count({ ...filters, sweets: [s.id] })} onClick={() => toggle('sweets', s.id)}>{s.label}</PickRow>)}
        <p className="t-ls muted" style={{ padding: '12px 16px 4px', textTransform: 'uppercase' }}>Acidity</p>
        {ACIDITY.map((s) => <PickRow key={s.id} multi lead={TASTE_EMOJI[s.id]} on={filters.acids.includes(s.id)} count={count({ ...filters, acids: [s.id] })} onClick={() => toggle('acids', s.id)}>{s.label}</PickRow>)}
        <p className="t-ls muted" style={{ padding: '12px 16px 4px', textTransform: 'uppercase' }}>Fizz</p>
        {FIZZ.map((s) => <PickRow key={s.id} multi lead={TASTE_EMOJI[s.id]} on={filters.fizzes.includes(s.id)} count={count({ ...filters, fizzes: [s.id] })} onClick={() => toggle('fizzes', s.id)}>{s.label}</PickRow>)}
        {foot(() => setFilters({ ...filters, sweets: [], acids: [], fizzes: [] }), filters.sweets.length + filters.acids.length + filters.fizzes.length > 0)}
      </>
    );
  } else if (key === 'flav') {
    body = (
      <>
        <p className="t-bs muted" style={{ padding: '4px 16px 8px' }}>Each flavour you tick narrows it further.</p>
        {FLAVOUR_TAGS.map((s) => <PickRow key={s.id} multi lead={s.emoji} on={filters.flavs.includes(s.id)} count={count({ ...filters, flavs: [...new Set([...filters.flavs, s.id])] })} onClick={() => toggle('flavs', s.id)}>{s.label}</PickRow>)}
        {foot(() => setFilters({ ...filters, flavs: [] }), filters.flavs.length > 0)}
      </>
    );
  } else if (key === 'abv') {
    const strengths = pool.filter((b) => passes({ ...filters, abv: null }, b, { text: texts.get(b.id) })).map(strengthOf).filter((v) => v != null);
    const min = strengths.length ? Math.floor(Math.min(...strengths)) : 0;
    const max = strengths.length ? Math.ceil(Math.max(...strengths)) : 20;
    body = (
      <>
        <div className="pbody">
          {max > min ? <RangeSlider label="Strength" min={min} max={max} value={filters.abv ? [Math.max(min, filters.abv[0]), Math.min(max, filters.abv[1])] : [min, max]}
            onChange={([a, z]) => setFilters({ ...filters, abv: a <= min && z >= max ? null : [a, z] })} /> : <p className="muted">Not enough strengths to choose between.</p>}
        </div>
        {foot(() => setFilters({ ...filters, abv: null }), Boolean(filters.abv))}
      </>
    );
  }
  return (
    <Popover open={open} anchor={drop?.anchor} onClose={onClose} label={{ type: 'Type of drink', sweet: 'Sweetness, acidity and fizz', flav: 'Flavour', abv: 'Strength' }[key]} width={key === 'abv' ? 340 : 300}>
      {body}
    </Popover>
  );
}

// A row of chips that scrolls sideways on a phone: its edges fade where there are more chips to swipe to
function ChipRow({ children }) {
  const row = useRef(null);
  const [edges, setEdges] = useState({ l: false, r: false });
  useEffect(() => {
    const el = row.current;
    if (!el) return undefined;
    const check = () => {
      const l = el.scrollLeft > 2, r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setEdges((e) => (e.l === l && e.r === r ? e : { l, r }));
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  });
  return <div ref={row} className={`chips ${edges.l ? 'fade-l' : ''} ${edges.r ? 'fade-r' : ''}`} role="toolbar" aria-label="Filters">{children}</div>;
}

// ---- the shelf screen ----
export default function Shelf({
  dest, brews, recipes, loading, categories, catLabel, filters, setFilters, sort, setSort, selectedId, onOpen, onFav, onNew, jobs, onJob,
  hrefFor, scrollRef, headerEnd, compact, isOwner,
}) {
  const isRecipes = dest === 'recipes';
  const isFavs = dest === 'favourites';
  const pool = isRecipes ? recipes : isFavs ? [...brews, ...recipes].filter((b) => b.favourite) : brews;
  const texts = useMemo(() => new Map(pool.map((b) => [b.id, searchText(b)])), [pool]);
  const [sheet, setSheet] = useState(null);
  const list = pool.filter((b) => passes(filters, b, { text: texts.get(b.id) }));
  const cards = useMemo(() => {
    if (isFavs) return sortCards(groupCards(list.filter((b) => !b.isRecipe), false).concat(groupCards(list.filter((b) => b.isRecipe), true)), 'name-asc', catLabel);
    return sortCards(groupCards(list, isRecipes), sort, catLabel);
  }, [list, isRecipes, isFavs, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const nFilters = filterCount(filters);
  const searching = Boolean(filters.q.trim()) || nFilters > 0;
  const placeholder = isRecipes ? (compact ? 'Search recipes' : `Search ${new Set(recipes.map(famKey)).size} recipes or ingredients`) : isFavs ? (compact ? 'Search' : 'Search your favourites') : (compact ? 'Search brews' : 'Search your brews');
  // tablet and desktop: each chip drops down its own options (the phone has the Filters button and sheet instead)
  const [drop, setDrop] = useState(null);
  const chip = (key, on, label, text) => <MenuChip on={on || drop?.key === key} label={label} onClick={(e) => setDrop({ key, anchor: e.currentTarget })}>{text}</MenuChip>;
  const sweetLabel = filters.sweets.length ? SWEETNESS.filter((s) => filters.sweets.includes(s.id)).map((s) => s.label).join(', ') : 'Sweetness';
  const typeLabel = filters.cat === 'all' ? 'Type' : (WINE_COLOURS.find((w) => w.id === filters.cat)?.label ? `${WINE_COLOURS.find((w) => w.id === filters.cat).label} wine` : catLabel(filters.cat));
  const sortMenu = useMenu();
  const sorts = isRecipes ? RECIPE_SORTS : BREW_SORTS;

  // My brews, unfiltered: your own grouped by where each brew is in its life, then everyone else's under their name
  // (Simon sees his invited guests' brews; a guest sees Simon's and the other guests')
  const own = cards.filter((c) => c.rep.mine !== false);
  const firstName = (c) => String(c.rep.ownerName || 'Someone').split(/\s+/)[0];
  const others = [...new Set(cards.filter((c) => c.rep.mine === false).map(firstName))];
  const groups = !isRecipes && !isFavs && !searching
    ? [['On the go', own.filter((c) => ACTIVE.includes(c.rep.status))], ['In the bottle', own.filter((c) => c.rep.status === 'bottled')], ['Finished', own.filter((c) => ['finished', 'dumped'].includes(c.rep.status))],
      ...others.map((n) => [`${n}'s brews`, cards.filter((c) => c.rep.mine === false && firstName(c) === n)])].filter(([, l]) => l.length)
    : null;
  const myBrews = brews.filter((b) => b.mine !== false);
  const rated = myBrews.filter((b) => b.rating);

  return (
    <>
      <div className="shelf-head gutter">
        <div className="search">
          <Icon n="search" />
          <input type="search" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder={placeholder} aria-label={placeholder} enterKeyHint="search" />
          {filters.q && <IconButton icon="close" label="Clear search" onClick={() => setFilters({ ...filters, q: '' })} />}
          {/* on a phone the filters live in a sheet, opened from here; on a wider screen they're the chips below */}
          {compact && (
            <Btn kind="filled" icon="tune" onClick={() => setSheet('sort')} aria-label={nFilters ? `Filters, ${nFilters} on` : 'Filters'} style={{ marginLeft: 4, marginRight: 4 }}>
              {nFilters ? `${nFilters} on` : 'Filters'}
            </Btn>
          )}
          {headerEnd}
        </div>
        {!compact && <ChipRow>
          {!isFavs && <FilterChip on={filters.fav} onClick={() => setFilters({ ...filters, fav: !filters.fav })}>Favourites</FilterChip>}
          {chip('type', filters.cat !== 'all', 'Type of drink', typeLabel)}
          {chip('sweet', filters.sweets.length + filters.acids.length + filters.fizzes.length > 0, 'Sweetness, acidity and fizz',
            filters.acids.length + filters.fizzes.length
              ? [...SWEETNESS.filter((s) => filters.sweets.includes(s.id)), ...ACIDITY.filter((s) => filters.acids.includes(s.id)), ...FIZZ.filter((s) => filters.fizzes.includes(s.id))].map((s) => s.label).join(', ')
              : sweetLabel)}
          {chip('flav', filters.flavs.length > 0, 'Flavour', filters.flavs.length ? `${filters.flavs.length} flavour${filters.flavs.length > 1 ? 's' : ''}` : 'Flavour')}
          {chip('abv', Boolean(filters.abv), 'Strength', filters.abv ? `${filters.abv[0]}% – ${filters.abv[1]}%` : 'Strength')}
          {!isFavs && (
            <button type="button" className="chip sl" onClick={sortMenu.show} aria-haspopup="menu">
              <span className="lead"><Icon n="sort" size={18} /></span>{sorts.find(([v]) => v === sort)?.[1] || 'Sort'}
            </button>
          )}
        </ChipRow>}
      </div>
      <Menu anchor={sortMenu.anchor} open={sortMenu.open} onClose={sortMenu.close} items={sorts.map(([v, l]) => ({ label: l, icon: sort === v ? 'check' : undefined, selected: sort === v, onClick: () => setSort(v) }))} />
      <FilterDropdown drop={drop} onClose={() => setDrop(null)} pool={pool} texts={texts} filters={filters} setFilters={setFilters} categories={categories} isRecipes={isRecipes || isFavs} />

      <div className="gutter" style={{ display: 'flex', flexDirection: 'column' }}>
        {dest === 'brews' && !searching && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
            <NextUp jobs={jobs} onJob={onJob} onOpen={(b) => onOpen(b, null)} />
            {myBrews.length > 0 && (
              <div className="stats">
                <Stat value={myBrews.filter((b) => b.status === 'fermenting').length} label="Fermenting" />
                <Stat value={myBrews.filter((b) => b.status === 'conditioning').length} label="Clearing" />
                <Stat value={myBrews.filter((b) => ['bottled', 'finished'].includes(b.status)).length} label="Bottled" />
                <Stat value={rated.length ? Number((rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1)) : '–'} label="Avg rating" decimals={1} />
              </div>
            )}
          </div>
        )}

        {loading ? <div style={{ paddingTop: 8 }}><SkeletonGrid n={compact ? 4 : 8} /></div> : (
          <>
            {searching && <div className="sect"><span>{cards.length} {isRecipes ? (cards.length === 1 ? 'drink' : 'drinks') : 'found'}</span>{nFilters > 0 && <Btn kind="text" onClick={() => setFilters({ ...EMPTY_FILTERS, q: filters.q, fav: filters.fav })}>Clear filters</Btn>}</div>}
            {groups ? groups.map(([label, l]) => (
              <React.Fragment key={label}>
                <div className="sect">{label}<span className="n">{l.length}</span></div>
                <Gallery cards={l} selectedId={selectedId} onOpen={onOpen} onFav={onFav} catLabel={catLabel} hrefFor={hrefFor} scrollRoot={scrollRef} />
              </React.Fragment>
            )) : cards.length > 0 && <div style={{ paddingTop: searching ? 0 : 8 }}><Gallery cards={cards} selectedId={selectedId} onOpen={onOpen} onFav={onFav} catLabel={catLabel} hrefFor={hrefFor} scrollRoot={scrollRef} /></div>}
            {!cards.length && (
              <div className="empty">
                <Vessel category={isRecipes ? 'mead' : 'cider'} status={isFavs ? 'planning' : 'fermenting'} isRecipe={false} size={88} activity="slowing" />
                <h3>{searching ? 'Nothing matches' : isFavs ? 'No favourites yet' : isRecipes ? 'The recipe book is empty' : 'Nothing brewing yet'}</h3>
                <p>{searching ? 'Try fewer filters or another word.' : isFavs ? 'Tap the heart on any brew or recipe to keep it here.' : isRecipes ? 'Add a recipe to get started.' : 'Start a brew, or pick one from the recipe book.'}</p>
                {searching ? <Btn kind="tonal" onClick={() => setFilters({ ...EMPTY_FILTERS, fav: false })}>Clear search and filters</Btn>
                  : (isRecipes ? isOwner : true) && !isFavs && <Btn kind="filled" icon="add" onClick={onNew}>{isRecipes ? 'New recipe' : 'New brew'}</Btn>}
              </div>
            )}
          </>
        )}
        <div className="shelf-end" />
      </div>

      <FilterSheet open={Boolean(sheet)} focus={sheet} onClose={() => setSheet(null)} pool={pool} texts={texts} filters={filters} setFilters={setFilters}
        categories={categories} isRecipes={isRecipes || isFavs} sort={sort} setSort={setSort} />
    </>
  );
}

export { FilterSheet };
