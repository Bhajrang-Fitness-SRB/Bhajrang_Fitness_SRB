import { Fragment } from 'react';

/** Tiny, safe markdown: **bold**, `code`, lists, headings, fenced code. Never injects HTML. */
function Inline({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <b key={i}>{p.slice(2, -2)}</b>
    : p.startsWith('`') && p.endsWith('`') && p.length > 2 ? <code key={i}>{p.slice(1, -1)}</code> : <Fragment key={i}>{p}</Fragment>)}</>;
}

export function Md({ text }: { text: string }) {
  return <>{text.split('```').map((chunk, i) => {
    if (i % 2) return <pre key={i}>{chunk.replace(/^[\w-]*\n/, '')}</pre>;
    return <Fragment key={i}>{chunk.split('\n').map((line, j) => {
      if (!line.trim()) return <div key={j} style={{ height: 6 }} />;
      const h = line.match(/^#{1,4}\s+(.*)/); if (h) return <div key={j} style={{ marginTop: 6 }}><b><Inline text={h[1]} /></b></div>;
      const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/); if (li) return <div key={j} style={{ paddingLeft: 14, textIndent: -12 }}>• <Inline text={li[1]} /></div>;
      if (/^---+$/.test(line.trim())) return <hr key={j} style={{ border: 0, borderTop: '1px solid var(--line)', margin: '10px 0' }} />;
      return <div key={j}><Inline text={line} /></div>;
    })}</Fragment>;
  })}</>;
}
