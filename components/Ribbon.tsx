import { ClaudeMark, OpenAIMark } from "./BrandMarks";

/**
 * A slanted ink ribbon that scrolls what Offload works with and what it does.
 * Google's products get plain generic icons (folder, envelope, photo), not Google's logos.
 */

const icon = (d: string) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ITEMS: { label: string; mark: React.ReactNode }[] = [
  { label: "Google Drive", mark: icon("M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.24 1.65.66L12.2 6H18.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z") },
  { label: "Gmail", mark: icon("M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9ZM4 7l8 6 8-6") },
  { label: "Google Photos", mark: icon("M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4.5 6a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM21 15l-5-5L5 19") },
  { label: "Claude", mark: <ClaudeMark size={20} /> },
  { label: "ChatGPT", mark: <span className="rb-openai"><OpenAIMark size={20} /></span> },
  { label: "Any MCP app", mark: icon("M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v4") },
  { label: "Bulk transfer", mark: icon("M4 8h13l-3-3M20 16H7l3 3") },
  { label: "Free tool", mark: icon("M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7Z") },
];

function Run({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="rb-run" aria-hidden={hidden || undefined}>
      {ITEMS.map((it) => (
        <li key={it.label}>
          <span className="rb-mark">{it.mark}</span>
          {it.label}
          <svg className="rb-star" width="14" height="14" viewBox="-10 -10 20 20" aria-hidden="true">
            <path d="M0-10C1-3 3-1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10Z" fill="currentColor" />
          </svg>
        </li>
      ))}
    </ul>
  );
}

export function Ribbon() {
  return (
    <div className="ribbon" aria-label="Works with Google Drive, Gmail, Google Photos, Claude, ChatGPT and any MCP app">
      <div className="rb-track">
        <Run />
        <Run hidden />
      </div>
    </div>
  );
}
