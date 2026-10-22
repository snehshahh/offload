"use client";

import { useState } from "react";
import { APP_URL } from "@/lib/site";

const LIMIT = 15;
const FROM_USED = 14.6;
const TO_USED = 1.2;

const FOLDERS = [
  { id: "wedding", name: "Wedding photos 2024", gb: 4.6 },
  { id: "phone", name: "Phone backup videos", gb: 3.9 },
  { id: "goa", name: "Trip to Goa", gb: 1.8 },
  { id: "college", name: "College projects", gb: 0.8 },
];

const fmt = (gb: number) => (gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb.toFixed(1)} GB`);

function Meter({ label, email, used }: { label: string; email: string; used: number }) {
  const pct = Math.min(100, (used / LIMIT) * 100);
  const full = pct >= 90;
  return (
    <div className="meter">
      <div className="meter-top">
        <span className="meter-label">{label}</span>
        {full ? <span className="meter-warn">Almost full</span> : null}
      </div>
      <span className="meter-email">{email}</span>
      <div className="meter-val">
        <b>{used.toFixed(1)} GB</b> of {LIMIT} GB
      </div>
      <div
        className="meter-bar"
        role="meter"
        aria-label={`${label} storage used`}
        aria-valuemin={0}
        aria-valuemax={LIMIT}
        aria-valuenow={Number(used.toFixed(1))}
      >
        <i className={full ? "is-full" : ""} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function HeroDemo() {
  const [on, setOn] = useState<Set<string>>(new Set());
  const moved = FOLDERS.filter((f) => on.has(f.id)).reduce((a, f) => a + f.gb, 0);
  const toggle = (id: string) =>
    setOn((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="demo" aria-label="Try it: tick folders to see storage move between accounts">
      <div className="demo-meters">
        <Meter label="Moving from" email="you@gmail.com" used={FROM_USED - moved} />
        <svg className="demo-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        <Meter label="Moving to" email="you.extra@gmail.com" used={TO_USED + moved} />
      </div>

      <div className="demo-card">
        <div className="demo-h">
          <span>Choose folders</span>
          <span className="demo-hint">Try it, tick a few</span>
        </div>
        <ul className="demo-list">
          {FOLDERS.map((f) => {
            const checked = on.has(f.id);
            return (
              <li key={f.id}>
                <label className={"demo-row" + (checked ? " on" : "")}>
                  <input type="checkbox" className="ck" checked={checked} onChange={() => toggle(f.id)} />
                  <svg className="fi" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.24 1.65.66L12.2 6H18.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z" />
                  </svg>
                  <span className="nm">{f.name}</span>
                  <span className="sz">{fmt(f.gb)}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="demo-foot">
          <span>
            <b>{on.size ? `${on.size} folder${on.size === 1 ? "" : "s"}` : "Nothing selected"}</b>
            {on.size ? `, ${fmt(moved)} freed` : ""}
          </span>
          <a className="btn btn-main" href={APP_URL}>
            Do it with your Drive
          </a>
        </div>
      </div>
    </div>
  );
}
