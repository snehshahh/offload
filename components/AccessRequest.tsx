"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "Offload is request-only" popup. While the Google consent screen is in Testing, only test users can sign in, so this
 * asks visitors whether they want access and sends their Gmail addresses to /api/access-request.
 *
 * It opens by itself after 30 seconds on any page (once; "No thanks" keeps it closed for a week), or straight away
 * when something calls openAccessRequest(), such as the button on the app's sign-in screen.
 */

const DELAY_MS = 30_000;
const KEY = "offload-access-request";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const EVENT = "offload:request-access";

type Saved = { state: "requested"; emails: string[]; at: number } | { state: "dismissed"; at: number };

function readSaved(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && (v.state === "requested" || v.state === "dismissed") ? v : null;
  } catch {
    return null;
  }
}
function save(v: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
}

export function openAccessRequest() {
  window.dispatchEvent(new Event(EVENT));
}

export default function AccessRequest() {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState("");
  const [trap, setTrap] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<string[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const show = useCallback(() => {
    const s = readSaved();
    setSent(s?.state === "requested" ? s.emails : null);
    setError("");
    setOpen(true);
  }, []);

  useEffect(() => {
    const s = readSaved();
    const quiet = s && (s.state === "requested" || Date.now() - s.at < SNOOZE_MS);
    const t = quiet ? undefined : window.setTimeout(show, DELAY_MS);
    window.addEventListener(EVENT, show);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(EVENT, show);
    };
  }, [show]);

  const close = useCallback(() => {
    setOpen(false);
    if (!readSaved()) save({ state: "dismissed", at: Date.now() });
  }, []);

  useEffect(() => {
    if (!open) return;
    (input.current || box.current)?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, close, sent]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const list = [...new Set(emails.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
    if (!list.length) return setError("Add the Gmail address you want to sign in with.");
    if (list.length > 5) return setError("Up to 5 addresses at a time.");
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/access-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: list, website: trap, page: location.pathname }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || "Couldn’t send your request just now. Try again in a minute.");
      save({ state: "requested", emails: list, at: Date.now() });
      setSent(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;
  return (
    <div className="ar-veil" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="ar-box" role="dialog" aria-modal="true" aria-labelledby="ar-title" tabIndex={-1} ref={box}>
        <button className="ar-x" onClick={close} aria-label="Close">
          ×
        </button>
        <p className="ar-tag">Request only</p>
        {sent ? (
          <>
            <h2 id="ar-title">You&rsquo;re on the list</h2>
            <p>
              We&rsquo;ve got your request for <b>{sent.join(", ")}</b>. Once {sent.length > 1 ? "they’re" : "it’s"} added, usually within a
              day, you can sign in to Offload with {sent.length > 1 ? "them" : "it"}.
            </p>
            <p className="ar-fine">Need another account added? Send a new request with it.</p>
            <div className="ar-actions">
              <button className="btn btn-main" onClick={() => setOpen(false)}>
                Done
              </button>
              <button className="btn btn-quiet" onClick={() => setSent(null)}>
                Add another account
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2 id="ar-title">Offload is request-only for now</h2>
            <p>
              Google is still reviewing Offload, so only approved Google accounts can sign in. <b>Would you like access?</b> Tell us
              the Gmail address you&rsquo;ll use, and we&rsquo;ll add you.
            </p>
            <label className="ar-label" htmlFor="ar-emails">
              Your Gmail address
            </label>
            <input
              id="ar-emails"
              ref={input}
              className="ar-input"
              type="text"
              inputMode="email"
              autoComplete="email"
              placeholder="you@gmail.com, you.archive@gmail.com"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
            />
            <p className="ar-fine">Moving files between accounts? Add every account you&rsquo;ll sign in with, separated by commas (up to 5).</p>
            <input className="ar-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={trap} onChange={(e) => setTrap(e.target.value)} />
            {error && (
              <p className="ar-error" role="alert">
                {error}
              </p>
            )}
            <div className="ar-actions">
              <button className="btn btn-main" type="submit" disabled={sending}>
                {sending ? "Sending…" : "Yes, request access"}
              </button>
              <button className="btn btn-quiet" type="button" onClick={close}>
                No thanks
              </button>
            </div>
            <p className="ar-fine">We only use this to give you access. See our <a href="/privacy">privacy policy</a>.</p>
          </form>
        )}
      </div>
    </div>
  );
}
