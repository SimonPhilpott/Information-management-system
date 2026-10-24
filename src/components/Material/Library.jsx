// The Library room of the home screen in the IMS design (25 Oct 2026, option B of the home mock-ups as Ims's Library
// room): three calmer columns. On the left your subjects, chat history and pinned rules; in the middle the
// conversation (or the spatial graph) with tone, mode and model as chips in its header and the library's options in
// one Sources menu (library or Gemini, citations, personal books, the graph, browsing, the fast index, admin); on the
// right Discover Topics. It takes exactly the props the old Dashboard/Layout did, and keeps using the library's own
// pieces (the chat, the subject tree, chat history, Discover Topics, the PDF viewer, sync status) inside, recoloured to
// the IMS design. Those pieces can't sit inside the .hbb root (their class names clash with the kit's), so the page is
// its own root and the menus and dialogs open in a small transparent .hbb layer above it.
import React, { useEffect, useState } from 'react';
import '../HomebrewBeta/hbb.css';
import './ims-m.css';
import { Icon, Menu, useMenu, Confirm, LayerProvider, DarkCtx } from '../HomebrewBeta/ui';
import SubjectFilter from '../Dashboard/SubjectFilter';
import ChatHistory from '../Dashboard/ChatHistory';
import TopicDiscovery from '../Dashboard/TopicDiscovery';
import SyncStatus from '../Dashboard/SyncStatus';
const PDFWorkspace = React.lazy(() => import('../Dashboard/PDFWorkspace'));

const TONES = [['friendly', 'Friendly', 'Conversational and human'], ['professional', 'Professional', 'Formal and polished'], ['direct', 'Direct', 'No fluff, straight to the point'], ['investigator', 'Investigator', 'Exhaustive, research-minded']];
const MODELS = [['flash', 'Flash', 'Fast, concise answers'], ['pro', 'Pro', 'Complex reasoning and research'], ['thinking', 'Thinking', 'Step-by-step analysis'], ['research', 'Research', 'Exhaustive exploration']];
const go = (to) => { window.history.pushState(null, '', to); window.dispatchEvent(new PopStateEvent('popstate')); };
const useWide = (q) => { const [m, setM] = useState(() => window.matchMedia(q).matches); useEffect(() => { const mq = window.matchMedia(q); const on = () => setM(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, [q]); return m; };

function Chip({ icon, label, value, onClick, on }) {
  return (
    <button type="button" className={`imsl-chip ${on ? 'on' : ''}`} onClick={onClick} aria-haspopup="menu" title={label}>
      <Icon n={icon} size={18} /><span className="v">{value}</span><Icon n="drop" size={18} className="dd" />
    </button>
  );
}

export default function Library(props) {
  const {
    children, sessions, activeSessionId, onLoadSession, onDeleteSession, onClearHistory, onNewChat,
    subjects, selectedSubjects, onSubjectsChange, currentModel, onModelChange, usage,
    topics, suggestions, onTopicClick, onRefreshSuggestions, syncStatus, onSync, pdfViewer, onClosePdf, onOpenPdf,
    authStatus, onOpenCatalog, onRefineAll, onOpenAdmin, onOpenHnsw, sidebarWidth, topicsWidth, onLogin,
    appMode, onModeChange, pinnedItems = [], onPin, chatTone, onToneChange, theme, gems = [], onActivateGem,
    isClearingHistory, showCitations, onToggleCitations, deletingSessionIds, onClearPins, onOpenGraph, showGraph,
    showPersonal, onTogglePersonal,
  } = props;
  const dark = theme === 'dark';
  const [layer, setLayer] = useState(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [clearPins, setClearPins] = useState(false);
  const [pdfWidth, setPdfWidth] = useState(500);
  const [resizingPdf, setResizingPdf] = useState(false);
  const threeCols = useWide('(min-width: 1180px)');
  const twoCols = useWide('(min-width: 860px)');
  const toneM = useMenu(), modelM = useMenu(), gemM = useMenu(), srcM = useMenu();
  const kb = appMode === 'kb';
  const activeGem = gems.find((g) => g.is_active === 1) || gems[0];
  const tone = TONES.find(([k]) => k === chatTone) || TONES[0];
  const model = MODELS.find(([k]) => k === currentModel) || MODELS[0];

  useEffect(() => {
    if (!resizingPdf) return undefined;
    const move = (e) => setPdfWidth(Math.max(300, Math.min(window.innerWidth * 0.8, window.innerWidth - e.clientX)));
    const up = () => setResizingPdf(false);
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [resizingPdf]);
  const launcher = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  const cost = usage?.month?.cost;

  const left = (
    <aside className={`imsl-left ${leftOpen && !twoCols ? 'open' : ''}`} style={{ width: twoCols ? Math.max(260, Math.min(340, sidebarWidth || 300)) : undefined }}>
      <button type="button" className="imsl-new" onClick={() => { onNewChat(); setLeftOpen(false); }}><Icon n="add" size={22} />New chat</button>
      {kb && (
        <section className="imsl-sec legacy">
          <SubjectFilter subjects={subjects} selected={selectedSubjects} onChange={onSubjectsChange} onRefineAll={onRefineAll} />
        </section>
      )}
      <section className="imsl-sec legacy">
        <ChatHistory sessions={sessions} activeId={activeSessionId} onLoad={(id) => { onLoadSession(id); setLeftOpen(false); }} onDelete={onDeleteSession} onClearAll={onClearHistory} isClearing={isClearingHistory} deletingIds={deletingSessionIds} />
      </section>
      {pinnedItems.length > 0 && (
        <section className="imsl-sec">
          <div className="imsl-h"><Icon n="fav" size={18} /><span>Pinned rules</span><button type="button" className="imsl-ib" onClick={() => setClearPins(true)} title="Clear all pinned rules" aria-label="Clear all pinned rules"><Icon n="del" size={18} /></button></div>
          <div className="imsl-pins">
            {pinnedItems.map((pin) => (
              <div key={pin.id} className="imsl-pin">
                <button type="button" className="t" onClick={() => onOpenPdf(pin.drive_file_id, pin.page_num, pin.filename)} title={`Open ${pin.filename}`}><Icon n="doc" size={18} /><span>{pin.filename.replace('.pdf', '')} (p.{pin.page_num})</span></button>
                <button type="button" className="imsl-ib" onClick={() => onPin(null, pin.id)} title="Remove this pin" aria-label="Remove this pin"><Icon n="close" size={18} /></button>
              </div>
            ))}
          </div>
        </section>
      )}
      <details className="imsl-sec imsl-status legacy">
        <summary><i className={`d ${syncStatus?.drive?.error || syncStatus?.indexing?.error ? 'bad' : syncStatus?.drive?.active || syncStatus?.indexing?.active ? 'busy' : 'ok'}`} />Library status and sync<Icon n="down" size={20} className="dd" /></summary>
        <SyncStatus syncStatus={syncStatus} onSync={onSync} onLogin={onLogin} authStatus={authStatus} onOpenHnsw={onOpenHnsw} />
        {!authStatus?.authenticated && <button type="button" className="imsl-new tonal" onClick={onLogin}><Icon n="person" size={20} />Sign in with Google</button>}
      </details>
    </aside>
  );

  const right = (
    <aside className={`imsl-right legacy ${rightOpen && !threeCols ? 'open' : ''}`} style={{ width: threeCols ? Math.max(280, Math.min(380, topicsWidth || 320)) : undefined }}>
      {!threeCols && <button type="button" className="imsl-ib close" onClick={() => setRightOpen(false)} aria-label="Close Discover Topics"><Icon n="close" /></button>}
      <TopicDiscovery topics={topics} suggestions={suggestions} onTopicClick={(t) => { onTopicClick(t); setRightOpen(false); }} onRefresh={onRefreshSuggestions} subjects={subjects} onOpenGraph={onOpenGraph} showGraph={showGraph} />
    </aside>
  );

  return (
    <DarkCtx.Provider value={dark}>
      <LayerProvider root={layer}>
        <div className={`imsl ${dark ? 'dark' : ''}`}>
          {(twoCols || leftOpen) && left}
          {((leftOpen && !twoCols) || (rightOpen && !threeCols)) && <div className="imsl-scrim" onClick={() => { setLeftOpen(false); setRightOpen(false); }} />}
          <main className="imsl-centre">
            <header className="imsl-head">
              {!twoCols && <button type="button" className="imsl-ib" onClick={() => setLeftOpen(true)} aria-label="Subjects and chats" title="Subjects and chats"><Icon n="list" /></button>}
              <span className="tile"><Icon n="book" size={22} /></span>
              <h1>Library</h1>
              <span className="chips">
                <Chip icon="chat" label="Tone" value={tone[1]} onClick={toneM.show} />
                {activeGem && <Chip icon="sparkle" label="Mode" value={activeGem.name} onClick={gemM.show} />}
                <Chip icon="bolt" label="Model" value={model[1]} onClick={modelM.show} />
                <Chip icon="tune" label="Sources" value={kb ? 'Your library' : 'Gemini'} onClick={srcM.show} on />
              </span>
              <span className="grow" />
              {cost != null && <button type="button" className="imsl-cost" onClick={() => go('/ims/costs')} title="Spend this month: open Costs">£{Number(cost).toFixed(2)} this month</button>}
              <button type="button" className="imsl-ib" onClick={launcher} aria-label="Search everything (Ctrl K)" title="Search everything (Ctrl K)"><Icon n="search" /></button>
              <button type="button" className={`imsl-ib ${showGraph ? 'on' : ''}`} onClick={onOpenGraph} aria-label={showGraph ? 'Back to the chat' : 'The spatial graph'} title={showGraph ? 'Back to the chat' : 'The spatial graph'}><Icon n={showGraph ? 'chat' : 'hub'} /></button>
              {!threeCols && <button type="button" className="imsl-ib" onClick={() => setRightOpen(true)} aria-label="Discover Topics" title="Discover Topics"><Icon n="explore" /></button>}
            </header>
            <div className="imsl-body">
              <div className="imsl-view legacy">
                <React.Suspense fallback={<div className="imsl-wait" />}>{children}</React.Suspense>
              </div>
              {pdfViewer && (
                <>
                  <div className={`pdf-pane-resizer ${resizingPdf ? 'active' : ''}`} onMouseDown={(e) => { e.preventDefault(); setResizingPdf(true); }} />
                  <div className="imsl-pdf legacy" style={{ width: twoCols ? `${pdfWidth}px` : '100%' }}>
                    <React.Suspense fallback={<div className="imsl-wait" />}>
                      <PDFWorkspace driveFileId={pdfViewer.driveFileId} initialPage={pdfViewer.pageNum || pdfViewer.page_num} filename={pdfViewer.filename} highlightText={pdfViewer.highlightText} onClose={onClosePdf} />
                    </React.Suspense>
                  </div>
                </>
              )}
            </div>
          </main>
          {(threeCols || rightOpen) && right}
        </div>
        <div className={`hbb imsm acc-green imsl-layer ${dark ? 'dark' : ''}`} ref={(el) => { if (el && el !== layer) setLayer(el); }} />
        <Menu anchor={toneM.anchor} open={toneM.open} onClose={toneM.close} items={TONES.map(([k, l]) => ({ label: l, icon: k === chatTone ? 'check' : 'blank', selected: k === chatTone, onClick: () => onToneChange(k) }))} />
        <Menu anchor={modelM.anchor} open={modelM.open} onClose={modelM.close} items={MODELS.map(([k, l, d]) => ({ label: `${l} · ${d}`, icon: k === currentModel ? 'check' : 'blank', selected: k === currentModel, onClick: () => onModelChange(k) }))} />
        <Menu anchor={gemM.anchor} open={gemM.open} onClose={gemM.close} items={gems.map((g) => ({ label: g.name, icon: g.id === activeGem?.id ? 'check' : 'blank', selected: g.id === activeGem?.id, onClick: () => onActivateGem(g.id) }))} />
        <Menu anchor={srcM.anchor} open={srcM.open} onClose={srcM.close} items={[
          { label: 'Your library (documents and subjects)', icon: kb ? 'check' : 'blank', selected: kb, onClick: () => onModeChange('kb') },
          { label: 'Gemini (general knowledge)', icon: !kb ? 'check' : 'blank', selected: !kb, onClick: () => onModeChange('general') },
          '-',
          kb && { label: showCitations ? 'Citations shown' : 'Citations hidden', icon: showCitations ? 'eye' : 'blank', onClick: onToggleCitations },
          kb && { label: showPersonal ? 'Personal books included' : 'Professional books only', icon: showPersonal ? 'person' : 'blank', onClick: onTogglePersonal },
          { label: showGraph ? 'Back to the chat' : 'The spatial graph', icon: showGraph ? 'chat' : 'hub', onClick: onOpenGraph },
          '-',
          { label: 'Browse the library', icon: 'book', onClick: onOpenCatalog },
          onOpenHnsw && { label: 'Fast index', icon: 'bolt', onClick: onOpenHnsw },
          onSync && { label: 'Sync the library now', icon: 'sync', onClick: onSync },
          { label: 'Memories', icon: 'note', onClick: () => go('/ims/memories') },
          { label: 'Admin', icon: 'admin', onClick: onOpenAdmin },
        ].filter(Boolean)} />
        <Confirm open={clearPins} title="Clear all pinned rules?" okLabel="Clear them" danger onOk={onClearPins} onClose={() => setClearPins(false)} />
      </LayerProvider>
    </DarkCtx.Provider>
  );
}
