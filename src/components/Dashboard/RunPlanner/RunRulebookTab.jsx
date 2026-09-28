import {
  BookOpen, FileText, Copy, Check, Edit3, Layers, Sparkles, RotateCw, Save, Upload, Trash2,
  CheckCircle, XCircle, ArrowRight, Plus, AlertCircle, HelpCircle,
  HeartPulse, Clock, Cookie, Mountain, Shield, ChevronDown, ChevronUp, BookMarked
} from 'lucide-react';
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
  handleResolveFinding,
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
          <h2 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
            Running with T1D: Comprehensive Glucose Rulebook & Literature
          </h2>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${rulebook?.isDefault ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'}`}>
            {rulebook?.isDefault ? 'Standard Evidence Base' : 'Custom Tailored'}
          </span>
          {rulebook?.updatedAt && (
            <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
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

      <p className={`text-[11px] leading-relaxed mb-4 ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
        A comprehensive clinical and field-tested rulebook for running with Type 1 Diabetes (Omnipod, AAPS closed loop, and CGM). Upload and index your diabetes sports books and studies, paste raw research papers for real-time comparative audit, and arbitrate whether AI findings should replace existing rules, fill missing gaps, or be dismissed.
      </p>

      {/* Sub-Navigation Tabs */}
      <div className={`flex flex-wrap items-center gap-2 border-b pb-3 mb-4 ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
        <button
          onClick={() => setRulebookTab('rulebook')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${rulebookTab === 'rulebook' ? (isDark ? 'bg-white/10 text-white' : 'bg-[#FAF7F2] text-[#2E2B27] border border-[#2E2B27]/15 shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5')}`}
        >
          <Layers size={13} />
          <span>Rulebook & Protocols</span>
        </button>

        <button
          onClick={() => setRulebookTab('library')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${rulebookTab === 'library' ? (isDark ? 'bg-white/10 text-white' : 'bg-[#FAF7F2] text-[#2E2B27] border border-[#2E2B27]/15 shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5')}`}
        >
          <BookOpen size={13} />
          <span>Uploaded Books & Literature</span>
          <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-500/20 text-emerald-400 font-bold tabular-nums">
            {books.length}
          </span>
        </button>

        <button
          onClick={() => setRulebookTab('paste')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${rulebookTab === 'paste' ? (isDark ? 'bg-white/10 text-white' : 'bg-[#FAF7F2] text-[#2E2B27] border border-[#2E2B27]/15 shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5')}`}
        >
          <FileText size={13} className="text-emerald-400" />
          <span>Paste & Review Research</span>
        </button>

        <button
          onClick={() => setRulebookTab('findings')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${rulebookTab === 'findings' ? (isDark ? 'bg-white/10 text-white' : 'bg-[#FAF7F2] text-[#2E2B27] border border-[#2E2B27]/15 shadow-sm') : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5')}`}
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
            <div className={`flex items-center justify-between text-[10px] ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
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
            <div className={`flex items-center gap-2 pt-2 border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
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
          <div className="flex flex-col gap-4">
            {/* 5 Core Dimension Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <div className={`rounded-xl p-3 border flex flex-col justify-between ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/10'}`}>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5 mb-1">
                    <HeartPulse size={11} /> 1. Launch Gate
                  </div>
                  <div className={`text-base font-black tabular-nums ${isDark ? '' : 'text-[#2E2B27]'}`}>7.0 - 10.0 <span className={`text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>mmol/L</span></div>
                </div>
                <p className={`text-[10px] mt-2 leading-tight ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                  Optimal start window. Delay with 0.3g/kg if 4.0-4.9; abort if &lt;4.0; ketone check if &gt;15.0.
                </p>
              </div>

              <div className={`rounded-xl p-3 border flex flex-col justify-between ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/10'}`}>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5 mb-1">
                    <Clock size={11} /> 2. IOB & Loop
                  </div>
                  <div className={`text-base font-black tabular-nums ${isDark ? '' : 'text-[#2E2B27]'}`}>&lt; 1.0 U <span className={`text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>start IOB</span></div>
                </div>
                <p className={`text-[10px] mt-2 leading-tight ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                  Set temp target (8.0-9.0) 60-90m prior. Reduce pre-run meal bolus by 30-50% within 2h.
                </p>
              </div>

              <div className={`rounded-xl p-3 border flex flex-col justify-between ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/10'}`}>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-yellow-500 flex items-center gap-1.5 mb-1">
                    <Cookie size={11} /> 3. Fueling Rate
                  </div>
                  <div className={`text-base font-black tabular-nums ${isDark ? '' : 'text-[#2E2B27]'}`}>30 - 60 g <span className={`text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>per hour</span></div>
                </div>
                <p className={`text-[10px] mt-2 leading-tight ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                  15-20g increments every 20-30 min. Up to 75g/h with higher IOB or hard pace.
                </p>
              </div>

              <div className={`rounded-xl p-3 border flex flex-col justify-between ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/10'}`}>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-1">
                    <Mountain size={11} /> 4. Terrain & Hills
                  </div>
                  <div className={`text-base font-black tabular-nums ${isDark ? '' : 'text-[#2E2B27]'}`}>Flats / Down <span className={`text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>stops</span></div>
                </div>
                <p className={`text-[10px] mt-2 leading-tight ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                  Fuel 3-5m before climbs or on descents. Avoid mid-climb fueling during anaerobic surges.
                </p>
              </div>

              <div className={`rounded-xl p-3 border flex flex-col justify-between ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/10'}`}>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5 mb-1">
                    <Shield size={11} /> 5. Nocturnal Lows
                  </div>
                  <div className={`text-base font-black tabular-nums ${isDark ? '' : 'text-[#2E2B27]'}`}>-20% Basal <span className={`text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>6h night</span></div>
                </div>
                <p className={`text-[10px] mt-2 leading-tight ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                  Refuel if finish &lt;6.0. Night-time hypo risk peaks 7-11h post-run; set overnight temp basal.
                </p>
              </div>
            </div>

            {/* Connected Books & Literature Highlight Banner */}
            {books && books.length > 0 && (
              <div className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border ${isDark ? 'bg-slate-950/50 border-emerald-500/20' : 'bg-emerald-50/60 border-emerald-500/20'}`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                    <BookMarked size={16} />
                  </div>
                  <div>
                    <div className={`text-xs font-bold flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
                      <span>Connected Guide Books & Evidence Base</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-500/20 text-emerald-400 font-black">
                        {books.length} Books Active
                      </span>
                    </div>
                    <div className={`text-[11px] line-clamp-1 mt-0.5 ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
                      {books.map((b) => b.title).join(' • ')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setRulebookTab('library')}
                  className={`${ghostClass} text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5`}
                >
                  <span>View Book Details</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            )}

            {/* Collapsible Full Rulebook Document Card */}
            <div className={`rounded-xl border transition-all ${isDark ? 'border-white/10 bg-slate-950/20' : 'border-[#2E2B27]/10 bg-[#FAF7F2]'}`}>
              <button
                onClick={() => setRulebookExpanded(!rulebookExpanded)}
                className="w-full p-3.5 flex items-center justify-between text-left hover:opacity-80 transition-opacity"
              >
                <span className={`text-xs font-bold flex items-center gap-2 ${isDark ? '' : 'text-[#2E2B27]'}`}>
                  <Sparkles size={13} className="text-emerald-400" />
                  {rulebookExpanded ? 'Hide Full Rulebook Document & Clinical Protocols' : 'View Full Rulebook Document & Clinical Protocols'}
                </span>
                <div className={`flex items-center gap-2 text-[10px] ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                  <span>{rulebook?.rulebook ? `${rulebook.rulebook.split('\n').length} lines` : '0 lines'}</span>
                  {rulebookExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </button>

              {rulebookExpanded && (
                <div className={`p-4 pt-2 border-t text-xs ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
                  {rulebook?.rulebook ? (
                    <div className="prose-container max-w-none text-xs leading-relaxed">
                      <Prose text={rulebook.rulebook} isDark={isDark} />
                    </div>
                  ) : (
                    <p className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>No rulebook loaded. Click Edit Rulebook to write your rules or reset to default.</p>
                  )}
                </div>
              )}
            </div>

            <div className={`flex items-center justify-between text-[10px] px-1 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
              <span>
                Running with T1D Rulebook is continuously referenced by the AI coach during activity scrutiny and run planning.
              </span>
              <span>{rulebook?.rulebook ? `${rulebook.rulebook.length.toLocaleString()} characters` : ''}</span>
            </div>
          </div>
        )
      )}

      {/* SUB-TAB 2: UPLOADED BOOKS & LITERATURE */}
      {rulebookTab === 'library' && (
        <div className="flex flex-col gap-4">
          <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/10'}`}>
            <h3 className={`text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
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
                  <span className={bookUploadFile ? 'text-emerald-400 font-medium' : (isDark ? 'text-slate-500' : 'text-[#6A645D]')}>
                    {bookUploadFile ? bookUploadFile.name : 'Select PDF or Text file...'}
                  </span>
                  <Upload size={13} className={`shrink-0 ml-1 ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`} />
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
            <h4 className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
              Indexed Library ({books.length})
            </h4>
            {books.length === 0 ? (
              <p className={`text-xs p-4 rounded-xl border border-dashed text-center ${isDark ? 'text-slate-500 border-white/10' : 'text-[#6A645D] border-[#2E2B27]/20 bg-[#FAF7F2]'}`}>
                No literature uploaded yet. Upload textbooks (e.g. Dr Sheri Colberg, Michael Riddell) to automatically scan for refinements.
              </p>
            ) : (
              books.map((b) => (
                <div
                  key={b.id}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${isDark ? 'border-white/5 bg-slate-900/30' : 'border-[#2E2B27]/10 bg-[#FAF7F2]'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`font-bold flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
                      <BookOpen size={13} className="text-emerald-400 shrink-0" />
                      <span className="truncate">{b.title}</span>
                      <span className={`text-[10px] font-normal ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>({(b.file_size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <div className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
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
          <div className={`p-4 rounded-xl border border-emerald-500/20 ${isDark ? 'bg-slate-950/40' : 'bg-[#FAF7F2]'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-emerald-400">
                <FileText size={13} />
                Paste Raw Research or Study Notes for Instant Comparative Audit
              </h3>

              {/* Clinical Research Presets */}
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Load sample:</span>
                <button
                  onClick={() => {
                    setPasteTitle('Sprint Blunting of Exercise-Induced Hypoglycemia (Michael Riddell)');
                    setPasteSource('Medicine & Science in Sports & Exercise (2006) / Riddell et al.');
                    setPasteText(`Performing a 10-second maximal sprint either immediately prior to or immediately following moderate-intensity aerobic exercise stimulates an immediate surge in circulating catecholamines (adrenaline and noradrenaline up to 10-14 fold above baseline). 

This sympathoadrenal surge triggers transient hepatic glucose production via glycogenolysis that surpasses peripheral glucose uptake for 30–60 minutes post-sprint. 

In T1D runners who experience persistent drops during the early miles, an initial 10-second maximal burst can stabilise glucose for 45 minutes without requiring immediate exogenous carbohydrates, blunting exercise-induced hypoglycemia.`);
                  }}
                  className={`${ghostClass} text-[10px] py-1 px-2`}
                  title="Load clinical research sample on sprint-induced catecholamine blunting"
                >
                  <Sparkles size={11} className="text-yellow-400" />
                  <span>Sample 1 (Sprint Blunting)</span>
                </button>

                <button
                  onClick={() => {
                    setPasteTitle('Exogenous Carbohydrate Oxidation: Dual-Source vs Glucose Alone');
                    setPasteSource('Medicine & Science in Sports & Exercise / ISPAD');
                    setPasteText(`Investigation into endurance athletes running with T1D for durations exceeding 90 minutes demonstrated that single-source glucose absorption saturates intestinal SGLT1 transporters at approximately 60 grams per hour (1.0 g/min). Ingesting more than 60 g/h of pure dextrose or maltodextrin leads to gastric distress and osmotic fluid shifts.

Conversely, utilizing a multiple-transportable carbohydrate formulation (2:1 Glucose-to-Fructose or Maltodextrin-to-Fructose ratio) engages both SGLT1 and GLUT5 transporters in the gut, increasing total exogenous carbohydrate absorption ceiling to 80–90 grams per hour. 

Furthermore, during ambient temperatures exceeding 24°C, supplementing each litre of hydration with 500–700 mg of sodium maintains microvascular perfusion and eliminates the 10–15 minute sensor lag typically observed in dehydrated runners.`);
                  }}
                  className={`${ghostClass} text-[10px] py-1 px-2`}
                  title="Load clinical research sample on dual-source fueling in heat"
                >
                  <Sparkles size={11} className="text-yellow-400" />
                  <span>Sample 2 (Dual-Source Fueling)</span>
                </button>
              </div>
            </div>

            <p className={`text-[11px] leading-relaxed mb-4 ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
              Paste excerpts from sports endocrinology studies, clinical trials, or personal training retrospective debriefs. Gemini Flash will compare the literature against your active <em>Running with T1D Rulebook</em> and surface conflicts or additions in the arbitration panel for your decision.
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
                  placeholder="e.g. Lancet Diabetes & Endocrinology 2024 / ISPAD"
                  value={pasteSource}
                  onChange={(e) => setPasteSource(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass}>Research Text / Clinical Notes</label>
                <div className={`flex items-center gap-3 text-[10px] ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
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

            <div className={`flex flex-wrap items-center justify-between gap-3 pt-2 border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
              <label className={`flex items-center gap-2 cursor-pointer text-xs ${isDark ? 'text-slate-300' : 'text-[#2E2B27]'}`}>
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
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>Filter Status:</span>
              {['all', 'pending', 'accepted', 'dismissed'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFindingsStatusFilter(st)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-all ${findingsStatusFilter === st ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5')}`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>Type:</span>
              {['all', 'conflict', 'addition', 'refinement'].map((tp) => (
                <button
                  key={tp}
                  onClick={() => setFindingsTypeFilter(tp)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-all ${findingsTypeFilter === tp ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5')}`}
                >
                  {tp}
                </button>
              ))}
            </div>
          </div>

          {findings.length === 0 ? (
            <div className={`p-8 rounded-xl border border-dashed text-center text-xs ${isDark ? 'border-white/10 text-slate-500' : 'border-[#2E2B27]/20 text-[#6A645D] bg-[#FAF7F2]'}`}>
              No findings generated yet. Click "Scan for Conflicts" on an uploaded book or use "Paste & Review Research" above.
            </div>
          ) : (
            findings
              .filter((f) => findingsStatusFilter === 'all' || f.status === findingsStatusFilter)
              .filter((f) => findingsTypeFilter === 'all' || f.finding_type === findingsTypeFilter)
              .map((f) => {
                const isConflict = f.finding_type === 'conflict';
                const isPending = f.status === 'pending';
                const isEditing = editingFindingId === f.id;

                return (
                  <div
                    key={f.id}
                    className={`p-4 rounded-xl border transition-all ${
                      f.status === 'accepted'
                        ? (isDark ? 'border-emerald-500/20 bg-emerald-950/10' : 'border-emerald-500/30 bg-emerald-50/50')
                        : f.status === 'dismissed'
                        ? (isDark ? 'border-white/5 opacity-50 bg-slate-950/20' : 'border-[#2E2B27]/10 opacity-50 bg-[#FAF7F2]')
                        : (isDark ? 'border-amber-500/30 bg-slate-900/40' : 'border-amber-500/40 bg-[#FAF7F2]')
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                          isConflict
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : f.finding_type === 'addition'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                        }`}>
                          {f.finding_type}
                        </span>
                        <span className={`font-bold text-xs ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>{f.category || f.title}</span>
                      </div>
                      <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Source: {f.book_title || 'Literature'}</span>
                    </div>

                    <p className={`text-xs leading-relaxed mb-3 ${isDark ? 'text-slate-300' : 'text-[#2E2B27]'}`}>{f.finding_description || f.description}</p>

                    {f.existing_rule_text && (
                      <div className="mb-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20 text-[11px]">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-red-400 mb-1">Active Rule in Rulebook:</div>
                        <div className={`font-mono text-[10px] ${isDark ? 'text-slate-300' : 'text-[#2E2B27]'}`}>{f.existing_rule_text}</div>
                      </div>
                    )}

                    {(f.proposed_rule_text || f.proposed_text || f.book_recommendation) && (
                      <div className="mb-3 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px]">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 mb-1">Literature Recommendation:</div>
                        {isEditing ? (
                          <div className="flex flex-col gap-2 mt-1">
                            <textarea
                              className={`${fieldClass} font-mono text-[10px] leading-relaxed`}
                              rows={3}
                              value={editingFindingText}
                              onChange={(e) => setEditingFindingText(e.target.value)}
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  if (handleResolveFinding) {
                                    handleResolveFinding(f, isConflict ? 'replace' : 'add', editingFindingText);
                                  } else {
                                    handleApplyFindingEdit(f.id);
                                  }
                                }}
                                disabled={busy === `res-${f.id}` || !editingFindingText.trim()}
                                className={`${btnClass} text-xs py-1 px-3`}
                              >
                                {busy === `res-${f.id}` ? <RotateCw size={12} className="animate-spin" /> : <Save size={12} />}
                                <span>Apply Custom Text</span>
                              </button>
                              <button
                                onClick={() => {
                                  setEditingFindingId(null);
                                  setEditingFindingText('');
                                }}
                                className={ghostClass}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={`font-mono text-[10px] ${isDark ? 'text-emerald-200' : 'text-emerald-900 font-medium'}`}>
                            {f.proposed_rule_text || f.proposed_text || f.book_recommendation}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Arbitration Actions */}
                    {isPending && !isEditing && (
                      <div className={`flex flex-wrap items-center gap-2 pt-2 border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
                        {isConflict ? (
                          <>
                            <button
                              onClick={() => {
                                if (handleResolveFinding) handleResolveFinding(f, 'replace');
                                else handleAcceptFinding(f.id);
                              }}
                              disabled={busy === `res-${f.id}` || busy === `resolve-${f.id}`}
                              className={btnClass}
                              title="Replace the conflicting rule in the rulebook with the book's recommendation"
                            >
                              {busy === `res-${f.id}` ? <RotateCw size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                              <span>Replace Rule</span>
                            </button>
                            <button
                              onClick={() => {
                                setEditingFindingId(f.id);
                                setEditingFindingText(f.proposed_text || f.proposed_rule_text || f.book_recommendation || '');
                              }}
                              className={ghostClass}
                              title="Fine-tune wording before applying"
                            >
                              <Edit3 size={12} />
                              <span>Edit & Apply</span>
                            </button>
                            <button
                              onClick={() => {
                                if (handleResolveFinding) handleResolveFinding(f, 'dismiss');
                                else handleDismissFinding(f.id);
                              }}
                              disabled={busy === `res-${f.id}` || busy === `resolve-${f.id}`}
                              className={`${ghostClass} ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-[#6A645D] hover:text-[#2E2B27]'} ml-auto`}
                              title="Reject change and retain your existing rulebook guidance"
                            >
                              <XCircle size={12} />
                              <span>Ignore / Keep Current</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                if (handleResolveFinding) handleResolveFinding(f, 'add');
                                else handleAcceptFinding(f.id);
                              }}
                              disabled={busy === `res-${f.id}` || busy === `resolve-${f.id}`}
                              className={btnClass}
                              title="Add this new protocol under the specified section of the rulebook"
                            >
                              {busy === `res-${f.id}` ? <RotateCw size={12} className="animate-spin" /> : <Plus size={12} />}
                              <span>Add to Rulebook</span>
                            </button>
                            <button
                              onClick={() => {
                                setEditingFindingId(f.id);
                                setEditingFindingText(f.proposed_text || f.proposed_rule_text || '');
                              }}
                              className={ghostClass}
                              title="Edit wording before adding"
                            >
                              <Edit3 size={12} />
                              <span>Edit & Add</span>
                            </button>
                            <button
                              onClick={() => {
                                if (handleResolveFinding) handleResolveFinding(f, 'dismiss');
                                else handleDismissFinding(f.id);
                              }}
                              disabled={busy === `res-${f.id}` || busy === `resolve-${f.id}`}
                              className={`${ghostClass} ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-[#6A645D] hover:text-[#2E2B27]'} ml-auto`}
                              title="Dismiss this addition"
                            >
                              <XCircle size={12} />
                              <span>Ignore</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Stamped Outcome If Resolved */}
                    {!isPending && (
                      <div className={`flex items-center gap-2 pt-2 border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'} text-[11px]`}>
                        {f.status === 'accepted' ? (
                          <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                            <CheckCircle size={12} />
                            <span>
                              Applied to Rulebook {f.user_action === 'replace' || isConflict ? '(replaced conflicting rule)' : '(added new protocol)'}
                            </span>
                          </span>
                        ) : (
                          <span className={`flex items-center gap-1.5 font-medium ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
                            <XCircle size={12} />
                            <span>Ignored / dismissed</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
      )}
    </div>
  );
}

