import React from 'react';
import { BookOpen, FileText, Copy, Check, Edit3, Layers, Sparkles, RotateCw, Save, Upload, Trash2, CheckCircle, XCircle, ArrowRight, Plus, AlertCircle, HelpCircle } from 'lucide-react';
import Prose from '../Prose';

/**
 * Tab 2: Running with T1D Comprehensive Rulebook, Book Intelligence, Research Review & Conflict Arbitration
 */
export default function RunRulebookTab({
  rulebook,
  rulebookDraft,
  setRulebookDraft,
  rulebookEditing,
  setRulebookEditing,
  rulebookExpanded,
  setRulebookExpanded,
  rulebookCopied,
  saveRulebookText,
  handleResetRulebook,
  copyRulebookText,
  rulebookTab,
  setRulebookTab,
  books,
  bookUploadTitle,
  setBookUploadTitle,
  bookUploadFile,
  setBookUploadFile,
  bookFileRef,
  handleUploadBook,
  handleDeleteBook,
  handleScanBook,
  findings,
  findingsStatusFilter,
  setFindingsStatusFilter,
  findingsTypeFilter,
  setFindingsTypeFilter,
  editingFindingId,
  setEditingFindingId,
  editingFindingText,
  setEditingFindingText,
  handleAcceptFinding,
  handleDismissFinding,
  handleApplyFindingEdit,
  pendingFindingsCount,
  pasteTitle,
  setPasteTitle,
  pasteSource,
  setPasteSource,
  pasteText,
  setPasteText,
  pasteSaveAsBook,
  setPasteSaveAsBook,
  handleReviewPastedResearch,
  busy,
  isDark,
  panelClass,
  labelClass,
  fieldClass,
  btnClass,
  ghostClass
}) {
  return (
    <div className={`${panelClass} border-emerald-500/30`}>
      {/* Tab Header & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center flex-wrap gap-2">
          <BookOpen size={16} className="text-emerald-400" />
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-200">
            Running with T1D: Comprehensive Glucose Rulebook & Literature
          </h2>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${rulebook?.isDefault ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'}`}>
            {rulebook?.isDefault ? 'Standard Evidence Base' : 'Custom Tailored'}
          </span>
          {rulebook?.updatedAt && (
            <span className="text-[10px] text-slate-500">
              Updated {new Date(rulebook.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRulebookTab('paste')}
            className={`${ghostClass} text-emerald-400 hover:text-emerald-300 font-semibold`}
            title="Paste clinical research notes or trial papers to review against rulebook"
          >
            <FileText size={12} />
            <span>Paste Research</span>
          </button>
          <button
            onClick={copyRulebookText}
            className={ghostClass}
            title="Copy the entire rulebook markdown text"
          >
            {rulebookCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>{rulebookCopied ? 'Copied' : 'Copy'}</span>
          </button>
          {rulebookEditing ? (
            <button
              onClick={() => { setRulebookDraft(rulebook?.rulebook || ''); setRulebookEditing(false); }}
              className={ghostClass}
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={() => { setRulebookDraft(rulebook?.rulebook || ''); setRulebookEditing(true); setRulebookTab('rulebook'); }}
              className={ghostClass}
            >
              <Edit3 size={12} />
              <span>Edit Rulebook</span>
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
        A comprehensive clinical and field-tested rulebook for running with Type 1 Diabetes (Omnipod, AAPS closed loop, and CGM). Upload and index your diabetes sports books and studies, paste raw research papers for real-time comparative audit, and arbitrate whether AI findings should replace existing rules, fill missing gaps, or be dismissed.
      </p>

      {/* Sub-Navigation Tabs */}
      <div className={`flex flex-wrap items-center gap-2 border-b pb-3 mb-4 ${isDark ? 'border-white/5' : 'border-[#2E2B27]/5'}`}>
        <button
          onClick={() => setRulebookTab('rulebook')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${rulebookTab === 'rulebook' ? (isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-slate-900') : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Layers size={13} />
          <span>Rulebook & Protocols</span>
        </button>

        <button
          onClick={() => setRulebookTab('library')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${rulebookTab === 'library' ? (isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-slate-900') : 'text-slate-400 hover:text-slate-200'}`}
        >
          <BookOpen size={13} />
          <span>Uploaded Books & Literature</span>
          <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-500/20 text-emerald-400 font-bold tabular-nums">
            {books.length}
          </span>
        </button>

        <button
          onClick={() => setRulebookTab('paste')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${rulebookTab === 'paste' ? (isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-slate-900') : 'text-slate-400 hover:text-slate-200'}`}
        >
          <FileText size={13} className="text-emerald-400" />
          <span>Paste & Review Research</span>
        </button>

        <button
          onClick={() => setRulebookTab('findings')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${rulebookTab === 'findings' ? (isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-slate-900') : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Sparkles size={13} className="text-yellow-400" />
          <span>AI Scan & Conflict Arbitration</span>
          {pendingFindingsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-500/20 text-amber-400 font-black tabular-nums animate-pulse">
              {pendingFindingsCount} pending
            </span>
          )}
        </button>
      </div>

      {/* SUB-TAB 1: ACTIVE RULEBOOK & PROTOCOLS */}
      {rulebookTab === 'rulebook' && (
        rulebookEditing ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>Markdown format. Use headings (##), bullet points (*), and bold (**text**) to organise your rules.</span>
              <span className="tabular-nums">{rulebookDraft.length} characters</span>
            </div>
            <textarea
              className={`${fieldClass} font-mono text-xs leading-relaxed`}
              rows={20}
              value={rulebookDraft}
              onChange={(e) => setRulebookDraft(e.target.value)}
              placeholder="Paste or write your Running with T1D Rulebook..."
            />
            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <button
                onClick={saveRulebookText}
                disabled={busy === 'rulebook' || !rulebookDraft.trim()}
                className={btnClass}
              >
                {busy === 'rulebook' ? <RotateCw size={13} className="animate-spin" /> : <Save size={13} />}
                <span>Save Rulebook</span>
              </button>
              <button
                onClick={() => { setRulebookDraft(rulebook?.rulebook || ''); setRulebookEditing(false); }}
                className={ghostClass}
              >
                Cancel
              </button>
              <button
                onClick={handleResetRulebook}
                disabled={busy === 'rulebook-reset'}
                className={`${ghostClass} ml-auto text-amber-400`}
                title="Reset to default clinical rulebook"
              >
                {busy === 'rulebook-reset' ? <RotateCw size={12} className="animate-spin" /> : <RotateCw size={12} />}
                <span>Reset to Default</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div
              className={`overflow-hidden transition-all rounded-xl p-4 border ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-[#2E2B27]/10'}`}
              style={{ maxHeight: rulebookExpanded ? 'none' : '450px' }}
            >
              {rulebook?.rulebook ? (
                <div className="prose-container max-w-none text-xs leading-relaxed">
                  <Prose content={rulebook.rulebook} isDark={isDark} />
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No rulebook loaded. Click Edit Rulebook to write your rules or reset to default.</p>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setRulebookExpanded(!rulebookExpanded)}
                className={`${ghostClass} text-xs font-bold text-emerald-400`}
              >
                {rulebookExpanded ? 'Collapse Rulebook' : 'Expand Full Rulebook'}
              </button>
              <span className="text-[10px] text-slate-500">
                Rulebook is automatically passed to Gemini AI to generate customized coaching directives.
              </span>
            </div>
          </div>
        )
      )}

      {/* SUB-TAB 2: UPLOADED BOOKS & LITERATURE */}
      {rulebookTab === 'library' && (
        <div className="flex flex-col gap-4">
          <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
            <h3 className="text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 text-slate-200">
              <Upload size={13} className="text-emerald-400" />
              Upload T1D Exercise Literature or Book (.pdf, .txt, .md)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-1">
                <label className={labelClass}>Book / Publication Title</label>
                <input
                  className={fieldClass}
                  placeholder="e.g. The Athlete's Guide to Diabetes"
                  value={bookUploadTitle}
                  onChange={(e) => setBookUploadTitle(e.target.value)}
                />
              </div>
              <div className="sm:col-span-1">
                <label className={labelClass}>File (.pdf, .txt, .md)</label>
                <input
                  ref={bookFileRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setBookUploadFile(f);
                      if (!bookUploadTitle) setBookUploadTitle(f.name.replace(/\.[^/.]+$/, ''));
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => bookFileRef.current?.click()}
                  className={`${fieldClass} text-left truncate flex items-center justify-between text-xs`}
                >
                  <span className={bookUploadFile ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                    {bookUploadFile ? bookUploadFile.name : 'Select PDF or Text file...'}
                  </span>
                  <Upload size={13} className="text-slate-400 shrink-0 ml-1" />
                </button>
              </div>
              <div className="sm:col-span-1 flex items-center gap-2">
                <button
                  onClick={handleUploadBook}
                  disabled={!bookUploadFile || !bookUploadTitle || busy === 'book-upload'}
                  className={`${btnClass} w-full`}
                >
                  {busy === 'book-upload' ? <RotateCw size={13} className="animate-spin" /> : <Upload size={13} />}
                  <span>Index Book</span>
                </button>
              </div>
            </div>
          </div>

          {/* Books List */}
          <div className="flex flex-col gap-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Indexed Library ({books.length})
            </h4>
            {books.length === 0 ? (
              <p className="text-xs text-slate-500 p-4 rounded-xl border border-dashed border-white/10 text-center">
                No literature uploaded yet. Upload textbooks (e.g. Dr Sheri Colberg, Michael Riddell) to automatically scan for refinements.
              </p>
            ) : (
              books.map((b) => (
                <div
                  key={b.id}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${isDark ? 'border-white/5 bg-slate-900/30' : 'border-[#2E2B27]/10 bg-white'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold flex items-center gap-2 text-slate-200">
                      <BookOpen size={13} className="text-emerald-400 shrink-0" />
                      <span className="truncate">{b.title}</span>
                      <span className="text-[10px] font-normal text-slate-500">({(b.file_size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Added {new Date(b.created_at).toLocaleDateString('en-GB')} • {b.word_count?.toLocaleString() || '?'} words
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => handleScanBook(b.id)}
                      disabled={busy === `scan-${b.id}`}
                      className={`${btnClass} text-xs py-1 px-3`}
                    >
                      {busy === `scan-${b.id}` ? <RotateCw size={12} className="animate-spin" /> : <Sparkles size={12} className="text-yellow-400" />}
                      <span>Scan for Conflicts</span>
                    </button>
                    <button
                      onClick={() => handleDeleteBook(b.id)}
                      disabled={busy === `del-${b.id}`}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-all"
                      title="Delete book"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: PASTE & REVIEW RESEARCH */}
      {rulebookTab === 'paste' && (
        <div className="flex flex-col gap-3">
          <div className="p-4 rounded-xl border border-emerald-500/20 bg-slate-950/40">
            <h3 className="text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 text-emerald-400">
              <FileText size={13} />
              Paste Raw Research or Study Notes for Instant Comparative Audit
            </h3>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
              Paste excerpts from sports endocrinology studies, clinical trials, or personal training retrospective debriefs. Gemini Flash will compare the literature against your active Running with T1D Rulebook and surface conflicts or additions in the arbitration panel.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelClass}>Research Title / Focus</label>
                <input
                  className={fieldClass}
                  placeholder="e.g. 10-second sprint catecholamine effect on glucose"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Source / Journal (Optional)</label>
                <input
                  className={fieldClass}
                  placeholder="e.g. Lancet Diabetes & Endocrinology 2024"
                  value={pasteSource}
                  onChange={(e) => setPasteSource(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass}>Research Text / Clinical Notes</label>
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span>{pasteText.length.toLocaleString()} characters</span>
                  <span>•</span>
                  <span>{pasteText.split(/\s+/).filter(Boolean).length} words</span>
                  {pasteText && (
                    <button
                      onClick={() => { setPasteText(''); setPasteTitle(''); setPasteSource(''); }}
                      className="text-red-400 hover:underline ml-2"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <textarea
                rows={8}
                className={`${fieldClass} font-mono text-[11px] leading-relaxed`}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste research text, study findings, trial protocol, or personal training experiment log here..."
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={pasteSaveAsBook}
                  onChange={(e) => setPasteSaveAsBook(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <span>Also save and index this note in my Uploaded Books & Literature Library</span>
              </label>

              <button
                onClick={handleReviewPastedResearch}
                disabled={!pasteText.trim() || pasteText.trim().length < 20 || busy === 'research-review'}
                className={`${btnClass} px-5`}
              >
                {busy === 'research-review' ? (
                  <>
                    <RotateCw size={13} className="animate-spin" />
                    <span>Cross-examining against Rulebook...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} className="text-yellow-400" />
                    <span>Review Research Against Rulebook</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: AI SCAN & CONFLICT ARBITRATION FINDINGS */}
      {rulebookTab === 'findings' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Filter Status:</span>
              {['all', 'pending', 'accepted', 'dismissed'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFindingsStatusFilter(st)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-all ${findingsStatusFilter === st ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Type:</span>
              {['all', 'conflict', 'addition', 'refinement'].map((tp) => (
                <button
                  key={tp}
                  onClick={() => setFindingsTypeFilter(tp)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-all ${findingsTypeFilter === tp ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {tp}
                </button>
              ))}
            </div>
          </div>

          {findings.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-white/10 text-center text-xs text-slate-500">
              No findings generated yet. Click "Scan for Conflicts" on an uploaded book or use "Paste & Review Research" above.
            </div>
          ) : (
            findings
              .filter((f) => findingsStatusFilter === 'all' || f.status === findingsStatusFilter)
              .filter((f) => findingsTypeFilter === 'all' || f.finding_type === findingsTypeFilter)
              .map((f) => (
                <div
                  key={f.id}
                  className={`p-4 rounded-xl border transition-all ${
                    f.status === 'accepted'
                      ? 'border-emerald-500/20 bg-emerald-950/10'
                      : f.status === 'dismissed'
                      ? 'border-white/5 opacity-50 bg-slate-950/20'
                      : 'border-amber-500/30 bg-slate-900/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                        f.finding_type === 'conflict'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : f.finding_type === 'addition'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      }`}>
                        {f.finding_type}
                      </span>
                      <span className="font-bold text-xs text-slate-200">{f.category}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">Source: {f.book_title || 'Literature'}</span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed mb-3">{f.finding_description}</p>

                  {f.existing_rule_text && (
                    <div className="mb-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20 text-[11px]">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-red-400 mb-1">Active Rule in Rulebook:</div>
                      <div className="text-slate-300 font-mono text-[10px]">{f.existing_rule_text}</div>
                    </div>
                  )}

                  {f.proposed_rule_text && (
                    <div className="mb-3 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px]">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 mb-1">Literature Recommendation:</div>
                      {editingFindingId === f.id ? (
                        <div className="flex flex-col gap-2 mt-1">
                          <textarea
                            className={`${fieldClass} font-mono text-[10px] leading-relaxed`}
                            rows={3}
                            value={editingFindingText}
                            onChange={(e) => setEditingFindingText(e.target.value)}
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleApplyFindingEdit(f.id)}
                              className={`${btnClass} text-xs py-1 px-3`}
                            >
                              Apply & Add to Rulebook
                            </button>
                            <button
                              onClick={() => setEditingFindingId(null)}
                              className={ghostClass}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-emerald-200 font-mono text-[10px]">{f.proposed_rule_text}</div>
                      )}
                    </div>
                  )}

                  {f.status === 'pending' && editingFindingId !== f.id && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                      <button
                        onClick={() => handleAcceptFinding(f.id)}
                        className={`${btnClass} text-xs py-1 px-3 bg-emerald-600 hover:bg-emerald-500`}
                      >
                        <CheckCircle size={12} />
                        <span>Accept & Incorporate into Rulebook</span>
                      </button>
                      <button
                        onClick={() => {
                          setEditingFindingId(f.id);
                          setEditingFindingText(f.proposed_rule_text || '');
                        }}
                        className={`${ghostClass} text-xs py-1 px-2.5`}
                      >
                        <Edit3 size={12} />
                        <span>Edit & Apply</span>
                      </button>
                      <button
                        onClick={() => handleDismissFinding(f.id)}
                        className={`${ghostClass} text-xs py-1 px-2.5 text-slate-500 hover:text-slate-400 ml-auto`}
                      >
                        <XCircle size={12} />
                        <span>Dismiss</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}
