import React from 'react';

// Renders the light markdown the AI writes (### headings, - or * bullets, **bold**) without
// pulling in a markdown library. Everything is escaped by React, so nothing can inject HTML.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <React.Fragment key={i}>{part}</React.Fragment>));
}

export default function Prose({ text, className = '' }) {
  const blocks = [];
  let list = null;
  const flush = () => { if (list) { blocks.push(<ul key={`u${blocks.length}`} className="list-disc pl-5 space-y-0.5 my-1">{list}</ul>); list = null; } };
  String(text || '').split('\n').forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[*-]\s+(.*)$/.exec(line);
    const heading = /^\s*#{1,4}\s+(.*)$/.exec(line);
    if (bullet) { list = list || []; list.push(<li key={idx}>{inline(bullet[1])}</li>); return; }
    flush();
    if (heading) blocks.push(<h4 key={idx} className="mt-3 mb-1 text-[11px] font-black uppercase tracking-wider opacity-80">{inline(heading[1].replace(/^\d+\.\s*/, ''))}</h4>);
    else if (line.trim()) blocks.push(<p key={idx} className="my-1">{inline(line)}</p>);
  });
  flush();
  return <div className={`text-xs leading-relaxed ${className}`}>{blocks}</div>;
}
