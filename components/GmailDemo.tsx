"use client";

import { useState } from "react";
import { APP_URL } from "@/lib/site";

type Stage = "pick" | "confirm" | "done";

const FILTERS = [
  { id: "promotions", label: "Promotions", count: 1840 },
  { id: "social", label: "Social", count: 612 },
  { id: "large", label: "Bigger than 10 MB", count: 148 },
  { id: "old", label: "Older than a year", count: 3270 },
];

const SAMPLES: Record<string, { subject: string; from: string; date: string }[]> = {
  promotions: [
    { subject: "Flash sale: 40% off everything", from: "Shop Deals", date: "Oct 22" },
    { subject: "Last chance! Ends tonight", from: "Travel Offers", date: "Oct 19" },
    { subject: "Your weekly picks are here", from: "Daily Digest", date: "Oct 16" },
  ],
  social: [
    { subject: "You have 12 new notifications", from: "Social Network", date: "Oct 21" },
    { subject: "Someone commented on your photo", from: "Photo App", date: "Oct 18" },
    { subject: "See who viewed your profile", from: "Career Site", date: "Oct 14" },
  ],
  large: [
    { subject: "Holiday videos (zip)", from: "Ravi", date: "Aug 3" },
    { subject: "Scanned documents, all pages", from: "Office Scanner", date: "Jun 27" },
    { subject: "Wedding album: full resolution", from: "Studio Lens", date: "Feb 11" },
  ],
  old: [
    { subject: "Your 2023 statement is ready", from: "Mobile Plan", date: "Sep 2023" },
    { subject: "Welcome to the newsletter", from: "Blog Weekly", date: "May 2023" },
    { subject: "Order shipped", from: "Online Store", date: "Jan 2023" },
  ],
};

// Filters combine like a Gmail search: each extra one narrows the results.
const countFor = (ids: string[]) => {
  if (!ids.length) return 0;
  const counts = FILTERS.filter((f) => ids.includes(f.id)).map((f) => f.count);
  return Math.round(Math.min(...counts) * Math.pow(0.45, ids.length - 1));
};

export function GmailDemo() {
  const [on, setOn] = useState<string[]>(["promotions"]);
  const [stage, setStage] = useState<Stage>("pick");
  const count = countFor(on);
  const n = count.toLocaleString("en-US");
  const rows = on.length ? SAMPLES[on[0]] : [];

  const toggle = (id: string) => {
    setStage("pick");
    setOn((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="gdemo" aria-label="Try it: tap filters to see how many emails match">
      <div className="demo-h">
        <span>Clean up Gmail</span>
        <span className="demo-hint">Try it, tap a filter</span>
      </div>
      <div className="gchips">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="gchip" aria-pressed={on.includes(f.id)} onClick={() => toggle(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {stage === "done" ? (
        <div className="gdone">
          <b>Moved {n} conversations to Trash.</b> Empty the Trash in Gmail to free the space now, or restore anything within
          30 days.
          <div className="gactions">
            <a className="btn btn-main" href={APP_URL}>
              Do it with your Gmail
            </a>
            <button type="button" className="btn btn-quiet" onClick={() => setStage("pick")}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="gcount">
            {on.length ? (
              <>
                <b>{n}</b> conversations match
              </>
            ) : (
              "Tap a filter to see how many emails match."
            )}
          </p>
          {rows.length ? (
            <ul className="glist">
              {rows.map((r) => (
                <li key={r.subject}>
                  <svg className="fi" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                    <path d="m4 7 8 6 8-6" />
                  </svg>
                  <span className="gmain">
                    <span className="nm">{r.subject}</span>
                    <span className="gsub">
                      {r.from} · {r.date}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="demo-foot">
            {stage === "confirm" ? (
              <>
                <b>Move {n} to Trash?</b>
                <span className="gactions">
                  <button type="button" className="btn btn-quiet" onClick={() => setStage("pick")}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => setStage("done")}>
                    Yes, move to Trash
                  </button>
                </span>
              </>
            ) : (
              <>
                <span>Starred and important mail is left alone.</span>
                <button type="button" className="btn btn-main" disabled={!count} onClick={() => setStage("confirm")}>
                  Move {count ? n : ""} to Trash
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
