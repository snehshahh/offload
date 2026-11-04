"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account } from "@/lib/drive/api";
import {
  acceptPending,
  count,
  findFiles,
  folderSize,
  human,
  listFolders,
  listing,
  listPending,
  storage,
  transfer,
  type AcceptResult,
  type FolderEntry,
  type Item,
  type PendingItem,
  type SizeState,
  type TransferResult,
} from "@/lib/drive/engine";
import { allowGmail, allowScope, hasGmail, hasScope, initBrowserAuth, onReauthNeeded, reauth, signIn, signOut, tokenFor } from "@/lib/drive/browserAuth";
import { LIBRARY_SCOPE, PICKER_SCOPE, ScopeNeededError } from "@/lib/drive/api";
import { copyPicked, endPicking, listPicked, MAX_PICK, pollPicking, relayViaSite, startPicking, type CopyProgress, type Picked } from "@/lib/photos/engine";
import {
  GMAIL_FILTERS,
  gmailPreview,
  gmailQuery,
  gmailSearchUrl,
  gmailTrashUrl,
  startTrash,
  trashSlice,
  type GmailFilter,
  type GmailSearch,
  type TrashState,
} from "@/lib/gmail/engine";
import { Mark } from "@/components/Logo";

const MAX_ACCOUNTS = 5;
type Store = Awaited<ReturnType<typeof storage>>;
type Tab = "folders" | "large" | "media" | "waiting" | "gmail" | "photos";
type Sel = { id: string; name: string; folder: boolean; bytes: number | null };
type Job =
  | { kind: "transfer"; from: string; to: string; result: TransferResult | null; running: boolean; error: string }
  | { kind: "accept"; to: string; result: AcceptResult | null; running: boolean; error: string }
  | { kind: "gmail"; email: string; result: TrashState | null; running: boolean; error: string }
  | { kind: "photos"; from: string; to: string; result: CopyProgress | null; running: boolean; error: string };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function OffloadApp({ clientId, classicUrl }: { clientId: string; classicUrl: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ready, setReady] = useState(false);
  const [stor, setStor] = useState<Record<string, Store | { error: string } | "loading">>({});
  const [fromE, setFromE] = useState("");
  const [toE, setToE] = useState("");
  const pickedByHand = useRef(false);
  const [tab, setTab] = useState<Tab>("folders");
  const [sel, setSel] = useState<Map<string, Sel>>(new Map());
  const [job, setJob] = useState<Job | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [waitingFor, setWaitingFor] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);

  const byEmail = useCallback((e: string) => accounts.find((a) => a.e === e), [accounts]);
  const from = byEmail(fromE);
  const to = byEmail(toE);

  const loadStorage = useCallback((list: Account[]) => {
    for (const a of list) {
      setStor((s) => ({ ...s, [a.e]: "loading" }));
      storage(a)
        .then((st) => setStor((s) => ({ ...s, [a.e]: st })))
        .catch((e) => setStor((s) => ({ ...s, [a.e]: { error: errText(e) } })));
    }
  }, []);

  useEffect(() => {
    const restored = initBrowserAuth(clientId);
    onReauthNeeded(setWaitingFor);
    setAccounts(restored);
    setReady(true);
    if (restored.length) loadStorage(restored);
  }, [clientId, loadStorage]);

  // Keep From/To valid; until the person picks, send from the fullest account to the one with the most room.
  useEffect(() => {
    const emails = accounts.map((a) => a.e);
    const loaded = accounts.map((a) => stor[a.e]).filter((s): s is Store => !!s && s !== "loading" && !("error" in s));
    let f = emails.includes(fromE) ? fromE : emails[0] || "";
    if (!pickedByHand.current && loaded.length === accounts.length && loaded.length > 1) {
      f = [...loaded].sort((x, y) => (y.percent_used ?? -1) - (x.percent_used ?? -1))[0].email;
    }
    let t = emails.includes(toE) && toE !== f ? toE : "";
    if (!t || !pickedByHand.current) {
      const others = loaded.filter((s) => s.email !== f).sort((x, y) => (y.bytes.free ?? Infinity) - (x.bytes.free ?? Infinity));
      t = others[0]?.email || emails.find((e) => e !== f) || "";
    }
    if (f !== fromE) setFromE(f);
    if (t !== toE) setToE(t);
  }, [accounts, stor, fromE, toE]);

  useEffect(() => setSel(new Map()), [fromE]);

  const addAccount = async () => {
    setNotice("");
    setBusy(true);
    try {
      const a = await signIn();
      if (accounts.some((x) => x.e === a.e)) {
        setNotice(`${a.e} is already signed in. To add another account, choose a different one in Google's window.`);
      } else {
        setAccounts((list) => [...list, a]);
        loadStorage([a]);
      }
    } catch (e) {
      setNotice(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const removeAccount = (e: string) => {
    signOut(e);
    setAccounts((list) => list.filter((a) => a.e !== e));
  };

  const toggle = useCallback((s: Sel) => {
    setSel((m) => {
      const n = new Map(m);
      if (n.has(s.id)) n.delete(s.id);
      else n.set(s.id, s);
      return n;
    });
  }, []);
  const setSize = useCallback((id: string, bytes: number) => {
    setSel((m) => {
      const s = m.get(id);
      if (!s || s.bytes === bytes) return m;
      const n = new Map(m);
      n.set(id, { ...s, bytes });
      return n;
    });
  }, []);

  const picked = [...sel.values()];
  const pickedBytes = picked.reduce((n, s) => n + (s.bytes || 0), 0);
  const unknownSizes = picked.some((s) => s.bytes === null);
  const pickedWhat = listing([
    ...(picked.some((s) => s.folder) ? [count(picked.filter((s) => s.folder).length, "folder")] : []),
    ...(picked.some((s) => !s.folder) ? [count(picked.filter((s) => !s.folder).length, "file")] : []),
  ]);

  const runTransfer = async () => {
    if (!from || !to) return;
    setConfirming(false);
    const base = { kind: "transfer" as const, from: from.e, to: to.e };
    setJob({ ...base, result: null, running: true, error: "" });
    try {
      let res = await transfer(accounts, { ids: picked.map((s) => s.id), from, to, budgetMs: 4000 });
      setJob({ ...base, result: res, running: !res.done, error: "" });
      while (!res.done) {
        res = await transfer(accounts, { state: res.state, budgetMs: 4000 });
        setJob({ ...base, result: res, running: !res.done, error: "" });
      }
      setSel(new Map());
      loadStorage([from, to]);
      setReload((n) => n + 1);
    } catch (e) {
      setJob((j) => (j ? { ...j, running: false, error: errText(e) } : j));
    }
  };

  const runAccept = async (receiver: Account, ids: string[]) => {
    const base = { kind: "accept" as const, to: receiver.e };
    setJob({ ...base, result: null, running: true, error: "" });
    try {
      let res = await acceptPending(receiver, ids, 4000);
      setJob({ ...base, result: res, running: !res.done, error: "" });
      while (!res.done) {
        res = await acceptPending(receiver, ids, 4000, res);
        setJob({ ...base, result: res, running: !res.done, error: "" });
      }
      loadStorage(accounts);
      setReload((n) => n + 1);
    } catch (e) {
      setJob((j) => (j ? { ...j, running: false, error: errText(e) } : j));
    }
  };

  const runCopy = async (src: Account, dst: Account, sessionId: string) => {
    const base = { kind: "photos" as const, from: src.e, to: dst.e };
    setJob({ ...base, result: null, running: true, error: "" });
    try {
      await copyPicked(src, dst, sessionId, {
        token: tokenFor,
        relay: relayViaSite,
        onProgress: (p) => setJob({ ...base, result: p, running: !p.done, error: "" }),
      });
      loadStorage([dst]);
      setReload((n) => n + 1); // the picking session is used up: start the tab afresh
    } catch (e) {
      setJob((j) => (j ? { ...j, running: false, error: errText(e) } : j));
    }
  };

  const runTrash = async (acct: Account, search: GmailSearch, limit: number) => {
    const base = { kind: "gmail" as const, email: acct.e };
    setJob({ ...base, result: null, running: true, error: "" });
    try {
      let st = await trashSlice(acct, startTrash(search, limit));
      setJob({ ...base, result: st, running: !st.done, error: "" });
      while (!st.done) {
        st = await trashSlice(acct, st);
        setJob({ ...base, result: st, running: !st.done, error: "" });
      }
      loadStorage([acct]);
      setReload((n) => n + 1);
    } catch (e) {
      setJob((j) => (j ? { ...j, running: false, error: errText(e) } : j));
    }
  };

  if (!ready) return <div className="oa" />;

  return (
    <div className="oa">
      <header className="oa-top">
        <a href="/" className="oa-brand" aria-label="Offload home">
          <Mark size={30} />
          <span>Offload</span>
          <span className="oa-beta">Beta</span>
        </a>
        <a className="oa-classic" href={classicUrl}>
          Classic app <span aria-hidden="true">&rarr;</span>
        </a>
      </header>

      {waitingFor.length > 0 && (
        <div className="oa-reauth" role="alert">
          <p>
            Google needs you to confirm access for <b>{waitingFor[0]}</b> to carry on. Nothing is lost; the job is paused.
          </p>
          <button className="btn btn-main" onClick={() => reauth(waitingFor[0]).catch((e) => setNotice(errText(e)))}>
            Continue
          </button>
        </div>
      )}

      {!clientId && <p className="oa-note bad">Offload isn&rsquo;t set up yet: the GOOGLE_CLIENT_ID environment variable is missing.</p>}
      {notice && (
        <p className="oa-note" role="status">
          {notice}{" "}
          <button className="oa-link" onClick={() => setNotice("")}>
            Dismiss
          </button>
        </p>
      )}

      {accounts.length === 0 ? (
        <section className="oa-hello">
          <p className="kicker">Step 1 of 2</p>
          <h1>
            Sign in with the account that&rsquo;s <mark>running out of space</mark>
          </h1>
          <p className="oa-lede">
            Then add your other Google account, and move folders, big files and photos between them in one go. The other
            account accepts automatically, right here.
          </p>
          <button className="btn btn-main btn-lg" onClick={addAccount} disabled={busy || !clientId}>
            {busy ? "Waiting for Google…" : "Sign in with Google"}
          </button>
          <ul className="oa-assure">
            <li>Runs in your browser: files go straight from one Google account to the other</li>
            <li>Nothing is deleted, and you can move things back</li>
            <li>Sign in with up to {MAX_ACCOUNTS} accounts</li>
          </ul>
        </section>
      ) : (
        <>
          <section className="oa-accounts" aria-label="Your accounts">
            {accounts.map((a, i) => (
              <AccountCard
                key={a.e}
                email={a.e}
                main={i === 0}
                st={stor[a.e]}
                role={tab === "gmail" ? "" : a.e === fromE ? "from" : a.e === toE ? "to" : ""}
                verb={tab === "photos" ? "Copying" : "Moving"}
                onRemove={() => removeAccount(a.e)}
              />
            ))}
            {accounts.length < MAX_ACCOUNTS && (
              <button className={`oa-add${accounts.length === 1 ? " is-cta" : ""}`} onClick={addAccount} disabled={busy}>
                <span className="oa-plus" aria-hidden="true">+</span>
                <b>{accounts.length === 1 ? "Add the account that receives files" : "Add another account"}</b>
                <span>{busy ? "Waiting for Google…" : `Up to ${MAX_ACCOUNTS} in all`}</span>
              </button>
            )}
          </section>

          {accounts.length > 1 && tab !== "gmail" && (
            <section className="oa-route" aria-label="Where files go">
              <label>
                <span>{tab === "photos" ? "Copy from" : "Move from"}</span>
                <select
                  value={fromE}
                  onChange={(e) => {
                    pickedByHand.current = true;
                    setFromE(e.target.value);
                    if (e.target.value === toE) setToE(fromE);
                  }}
                >
                  {accounts.map((a) => (
                    <option key={a.e}>{a.e}</option>
                  ))}
                </select>
              </label>
              <button
                className="oa-swap"
                aria-label="Swap the two accounts"
                onClick={() => {
                  pickedByHand.current = true;
                  setFromE(toE);
                  setToE(fromE);
                }}
              >
                ⇄
              </button>
              <label>
                <span>to</span>
                <select
                  value={toE}
                  onChange={(e) => {
                    pickedByHand.current = true;
                    setToE(e.target.value);
                  }}
                >
                  {accounts
                    .filter((a) => a.e !== fromE)
                    .map((a) => (
                      <option key={a.e}>{a.e}</option>
                    ))}
                </select>
              </label>
            </section>
          )}

          <nav className="oa-tabs" role="tablist" aria-label="What to move">
            {(
              [
                ["folders", "Folders"],
                ["large", "Large files"],
                ["media", "Photos & videos"],
                ["waiting", "Waiting to accept"],
                ["gmail", "Gmail cleanup"],
                ["photos", "Google Photos"],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className="oa-tab" onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </nav>

          <section className="oa-panel">
            {from && tab === "folders" && <FoldersTab key={from.e + reload} acct={from} sel={sel} toggle={toggle} setSize={setSize} />}
            {from && tab === "large" && <FilesTab key={from.e + reload} acct={from} sel={sel} toggle={toggle} mode="large" />}
            {from && tab === "media" && <FilesTab key={from.e + reload} acct={from} sel={sel} toggle={toggle} mode="media" />}
            {tab === "waiting" && <WaitingTab key={reload} accounts={accounts} onAccept={runAccept} />}
            {tab === "gmail" && <GmailTab accounts={accounts} initial={fromE} stor={stor} reloadKey={reload} onTrash={runTrash} />}
            {tab === "photos" && from && to && <PhotosTab key={from.e + to.e + reload} from={from} to={to} onCopy={runCopy} />}
            {tab === "photos" && (!from || !to) && (
              <p className="oa-empty">Add the account you want to copy photos to, then pick photos here.</p>
            )}
          </section>

          {picked.length > 0 && (tab === "folders" || tab === "large" || tab === "media") && (
            <div className="oa-bar" role="region" aria-label="Selection">
              <p>
                <b>{pickedWhat}</b> selected
                {pickedBytes > 0 && (
                  <>
                    , {unknownSizes ? "at least " : ""}
                    {human(pickedBytes)}
                  </>
                )}
                <button className="oa-link" onClick={() => setSel(new Map())}>
                  Clear
                </button>
              </p>
              {to ? (
                <button className="btn btn-main" onClick={() => setConfirming(true)}>
                  Move to {to.e}
                </button>
              ) : (
                <button className="btn btn-main" onClick={addAccount}>
                  Add an account to move to
                </button>
              )}
            </div>
          )}
        </>
      )}

      {confirming && from && to && (
        <Modal title="Move these to your other account?" onClose={() => setConfirming(false)}>
          <p>
            <b>{pickedWhat}</b>
            {pickedBytes > 0 && (
              <>
                {" "}
                ({unknownSizes ? "at least " : "about "}
                {human(pickedBytes)})
              </>
            )}{" "}
            will move from <b>{from.e}</b> to <b>{to.e}</b>, with everything inside the folders. {to.e} accepts automatically.
          </p>
          <p className="oa-fine">
            Nothing is copied or deleted, so nothing is lost: ownership changes hands, and {from.e} keeps edit access. You can
            move things back any time.
          </p>
          <div className="oa-actions">
            <button className="btn btn-main" onClick={runTransfer}>
              Move now
            </button>
            <button className="btn btn-quiet" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {job && (
        <Modal
          title={
            job.running
              ? job.kind === "transfer"
                ? "Moving…"
                : job.kind === "gmail"
                  ? "Moving to Trash…"
                  : job.kind === "photos"
                    ? "Copying…"
                  : "Accepting…"
              : job.error
                ? "Something went wrong"
                : "Done"
          }
          onClose={job.running ? undefined : () => setJob(null)}
        >
          {job.running && <div className="oa-strip" aria-hidden="true" />}
          <p className="oa-msg" aria-live="polite">
            {job.result?.message || (job.running ? "Getting started…" : "")}
          </p>
          {job.error && <p className="oa-note bad">{job.error}</p>}
          {job.kind === "transfer" && job.result && job.result.moved_this_step.length > 0 && job.running && (
            <p className="oa-fine">Just moved: {job.result.moved_this_step.slice(0, 5).join(", ")}</p>
          )}
          {job.result && "errors" in job.result && job.result.errors.length > 0 && (
            <details className="oa-errors">
              <summary>{count(job.result.errors.length, "problem")}</summary>
              <ul>
                {job.result.errors.map((e) => (
                  <li key={e.id + e.detail}>
                    <b>{e.name}</b>: {e.detail}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {job.running ? (
            <p className="oa-fine">Keep this tab open until it finishes.</p>
          ) : (
            <div className="oa-actions">
              <button className="btn btn-main" onClick={() => setJob(null)}>
                Close
              </button>
              {job.kind === "photos" && job.result && job.result.copied > 0 && job.result.albumUrl && (
                <a className="btn btn-quiet" href={job.result.albumUrl} target="_blank" rel="noreferrer">
                  Open the album
                </a>
              )}
              {job.kind === "gmail" && job.result && job.result.trashed > 0 && (
                <a className="btn btn-quiet" href={gmailTrashUrl(job.email)} target="_blank" rel="noreferrer">
                  Open Gmail&rsquo;s Trash
                </a>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */

function AccountCard({ email, main, st, role, verb, onRemove }: { email: string; main: boolean; st: Store | { error: string } | "loading" | undefined; role: "from" | "to" | ""; verb: string; onRemove: () => void }) {
  const ok = st && st !== "loading" && !("error" in st) ? st : null;
  const pct = ok?.percent_used ?? 0;
  return (
    <article className={`oa-acct${role ? " is-" + role : ""}`}>
      {role && <span className={`oa-role ${role}`}>{role === "from" ? `${verb} from` : `${verb} to`}</span>}
      <div className="oa-acct-top">
        <span className="oa-avatar" aria-hidden="true">
          {email[0]?.toUpperCase()}
        </span>
        <span className="oa-email" title={email}>
          {email}
        </span>
      </div>
      {ok ? (
        <>
          <p className="oa-used">
            <b>{ok.used}</b> of {ok.total}
            <span className={`oa-status s-${ok.status.replace(" ", "-")}`}>{ok.status === "ok" ? `${ok.free} free` : ok.status}</span>
          </p>
          <div className="oa-meter" aria-label={`${pct}% used`}>
            <i className={pct >= 90 ? "is-full" : ""} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </>
      ) : (
        <p className="oa-used muted">{st && st !== "loading" && "error" in st ? st.error : "Checking storage…"}</p>
      )}
      <div className="oa-foot">
        <span className="oa-break">{ok ? `Drive ${ok.breakdown.drive} · Gmail & Photos ${ok.breakdown.gmail_and_photos}` : ""}</span>
        <button className="oa-link oa-remove" onClick={onRemove}>
          {main ? "Sign out" : "Remove"}
        </button>
      </div>
    </article>
  );
}

/* --------------------------------------------------------------------- */

type Sizes = Record<string, { bytes: number; done: boolean }>;
const sizeCache = new Map<string, Sizes>(); // per account, survives tab switches

function FoldersTab({ acct, sel, toggle, setSize }: { acct: Account; sel: Map<string, Sel>; toggle: (s: Sel) => void; setSize: (id: string, b: number) => void }) {
  const [path, setPath] = useState<{ id: string; name: string }[]>([{ id: "root", name: "My Drive" }]);
  const [folders, setFolders] = useState<FolderEntry[] | null>(null);
  const [error, setError] = useState("");
  const [sizes, setSizes] = useState<Sizes>(() => sizeCache.get(acct.e) || {});
  const here = path[path.length - 1];

  useEffect(() => {
    let live = true;
    setFolders(null);
    setError("");
    listFolders(acct, here.id)
      .then((f) => live && setFolders(f))
      .catch((e) => live && setError(errText(e)));
    return () => {
      live = false;
    };
  }, [acct, here.id]);

  // Add up folder sizes in the background, three at a time.
  useEffect(() => {
    if (!folders) return;
    let live = true;
    const todo = folders.filter((f) => !sizes[f.id]?.done).map((f) => f.id);
    const work = async () => {
      while (live && todo.length) {
        const id = todo.shift()!;
        let st: SizeState | undefined;
        try {
          do {
            const r = await folderSize(acct, id, st, 6000);
            st = r.state;
            if (!live) return;
            setSizes((s) => {
              const n = { ...s, [id]: { bytes: r.size_bytes, done: r.done } };
              sizeCache.set(acct.e, n);
              return n;
            });
          } while (st && live);
        } catch {
          /* leave the size blank */
        }
      }
    };
    Promise.all([work(), work(), work()]);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders, acct]);

  useEffect(() => {
    for (const [id, s] of Object.entries(sizes)) if (s.done && sel.has(id)) setSize(id, s.bytes);
  }, [sizes, sel, setSize]);

  return (
    <div>
      <div className="oa-crumbs">
        {path.map((p, i) => (
          <span key={p.id}>
            {i > 0 && <span aria-hidden="true"> / </span>}
            {i < path.length - 1 ? <button className="oa-link" onClick={() => setPath(path.slice(0, i + 1))}>{p.name}</button> : <b>{p.name}</b>}
          </span>
        ))}
      </div>
      <p className="oa-hint">Tick folders to move them with everything inside. Open one to pick something deeper.</p>
      {error && <p className="oa-note bad">{error}</p>}
      {!folders && !error && <p className="oa-loading">Loading folders…</p>}
      {folders && folders.length === 0 && <p className="oa-empty">No folders here.</p>}
      <ul className="oa-list">
        {folders?.map((f) => {
          const s = sizes[f.id];
          const on = sel.has(f.id);
          return (
            <li key={f.id} className={on ? "is-on" : ""}>
              <input
                type="checkbox"
                className="ck"
                aria-label={`Select ${f.name}`}
                checked={on}
                onChange={() => toggle({ id: f.id, name: f.name, folder: true, bytes: s?.done ? s.bytes : null })}
              />
              <FolderIcon />
              <button className="oa-name" onClick={() => setPath([...path, { id: f.id, name: f.name }])}>
                {f.name}
              </button>
              {!f.owned && <span className="oa-tag">Shared by {f.owner}</span>}
              <span className="oa-size">{s ? (s.done ? human(s.bytes) : `${human(s.bytes)}…`) : "…"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------------- */

function FilesTab({ acct, sel, toggle, mode }: { acct: Account; sel: Map<string, Sel>; toggle: (s: Sel) => void; mode: "large" | "media" }) {
  const [minMB, setMinMB] = useState(100);
  const [kind, setKind] = useState<"media" | "images" | "videos">("media");
  const [items, setItems] = useState<Item[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "more" | "idle">("loading");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const opts = useMemo(
    () => (mode === "large" ? { kind: "all" as const, min_size_mb: minMB, sort: "largest" as const } : { kind, sort: "largest" as const }),
    [mode, minMB, kind]
  );

  const load = useCallback(
    async (page?: string) => {
      setState(page ? "more" : "loading");
      setError("");
      try {
        const r = await findFiles(acct, { ...opts, limit: mode === "media" ? 60 : 50, page_token: page });
        setItems((cur) => (page ? [...cur, ...r.items] : r.items));
        setNext(r.next_page_token);
        if (!page) setMessage(r.message);
      } catch (e) {
        setError(errText(e));
      } finally {
        setState("idle");
      }
    },
    [acct, opts, mode]
  );

  useEffect(() => {
    load();
  }, [load]);

  const allOn = items.length > 0 && items.every((i) => sel.has(i.id));
  const selectAll = () => {
    for (const i of items) if (allOn === sel.has(i.id)) toggle({ id: i.id, name: i.name, folder: false, bytes: i.size_bytes });
  };

  return (
    <div>
      <div className="oa-filters">
        {mode === "large" ? (
          <label>
            Bigger than{" "}
            <select value={minMB} onChange={(e) => setMinMB(Number(e.target.value))}>
              {[25, 50, 100, 250, 500, 1024].map((n) => (
                <option key={n} value={n}>
                  {n >= 1024 ? "1 GB" : `${n} MB`}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="oa-seg" role="group" aria-label="Show">
            {(
              [
                ["media", "All"],
                ["images", "Photos"],
                ["videos", "Videos"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
        )}
        {items.length > 0 && (
          <button className="oa-link" onClick={selectAll}>
            {allOn ? "Unselect all" : `Select all ${items.length}`}
          </button>
        )}
      </div>
      {message && state !== "loading" && items.length > 0 && <p className="oa-hint">{message}</p>}
      {error && <p className="oa-note bad">{error}</p>}
      {state === "loading" && <p className="oa-loading">Looking through {acct.e}…</p>}
      {state !== "loading" && !items.length && !error && <p className="oa-empty">Nothing like that in {acct.e}.</p>}

      {mode === "large" ? (
        <ul className="oa-list">
          {items.map((i) => {
            const on = sel.has(i.id);
            return (
              <li key={i.id} className={on ? "is-on" : ""}>
                <input type="checkbox" className="ck" aria-label={`Select ${i.name}`} checked={on} onChange={() => toggle({ id: i.id, name: i.name, folder: false, bytes: i.size_bytes })} />
                <FileIcon />
                <a className="oa-name" href={i.link} target="_blank" rel="noreferrer">
                  {i.name}
                </a>
                <span className="oa-date">{date(i.modified)}</span>
                <span className="oa-size">{i.size}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="oa-grid">
          {items.map((i) => {
            const on = sel.has(i.id);
            return (
              <li key={i.id} className={on ? "is-on" : ""}>
                <label>
                  <input type="checkbox" className="ck" aria-label={`Select ${i.name}`} checked={on} onChange={() => toggle({ id: i.id, name: i.name, folder: false, bytes: i.size_bytes })} />
                  <span className="oa-thumb">
                    {i.thumb ? <img src={i.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <FileIcon />}
                    {i.type.startsWith("video/") && <span className="oa-vid">Video</span>}
                  </span>
                  <span className="oa-cap">
                    <span>{i.name}</span>
                    <b>{i.size}</b>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {next && (
        <button className="btn btn-quiet oa-more" onClick={() => load(next)} disabled={state !== "idle"}>
          {state === "more" ? "Loading…" : "Show more"}
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */

function WaitingTab({ accounts, onAccept }: { accounts: Account[]; onAccept: (a: Account, ids: string[]) => void }) {
  const [lists, setLists] = useState<Record<string, PendingItem[] | "loading" | { error: string }>>({});

  useEffect(() => {
    for (const a of accounts) {
      setLists((l) => ({ ...l, [a.e]: "loading" }));
      listPending(a)
        .then((r) => setLists((l) => ({ ...l, [a.e]: r.items })))
        .catch((e) => setLists((l) => ({ ...l, [a.e]: { error: errText(e) } })));
    }
  }, [accounts]);

  return (
    <div>
      <p className="oa-hint">
        Transfers sent from the classic app, or from Drive itself, wait here until the receiving account accepts them. Moves made
        in this app are accepted straight away, so they never show up here.
      </p>
      {accounts.map((a) => {
        const l = lists[a.e];
        return (
          <div key={a.e} className="oa-wait">
            <h3>{a.e}</h3>
            {l === "loading" || !l ? (
              <p className="oa-loading">Checking…</p>
            ) : "error" in l ? (
              <p className="oa-note bad">{l.error}</p>
            ) : l.length === 0 ? (
              <p className="oa-empty">Nothing waiting.</p>
            ) : (
              <>
                <ul className="oa-list">
                  {l.slice(0, 50).map((i) => (
                    <li key={i.id}>
                      {i.type === "folder" ? <FolderIcon /> : <FileIcon />}
                      <span className="oa-name">{i.name}</span>
                      <span className="oa-tag">From {i.from}</span>
                      <span className="oa-size">{i.type === "folder" ? "" : i.size}</span>
                    </li>
                  ))}
                </ul>
                <button className="btn btn-main" onClick={() => onAccept(a, l.map((i) => i.id))}>
                  Accept all {l.length} into {a.e}
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------- */

function PhotosTab({ from, to, onCopy }: { from: Account; to: Account; onCopy: (from: Account, to: Account, sessionId: string) => void }) {
  const [, rerender] = useState(0);
  const [error, setError] = useState("");
  const [session, setSession] = useState<{ id: string; uri: string; pollMs: number } | null>(null);
  const [blockedUri, setBlockedUri] = useState("");
  const [picked, setPicked] = useState<Picked[] | null>(null);
  const [checking, setChecking] = useState(false);
  const canPick = hasScope(from.e, PICKER_SCOPE);
  const canAdd = hasScope(to.e, LIBRARY_SCOPE);

  const allow = (e: string, scope: string) => {
    setError("");
    allowScope(e, scope)
      .then(() => rerender((n) => n + 1))
      .catch((err) => setError(errText(err)));
  };

  const check = useCallback(async () => {
    if (!session) return;
    setChecking(true);
    try {
      const s = await pollPicking(from, session.id);
      if (s.ready) setPicked(await listPicked(from, session.id));
    } catch (e) {
      setError(errText(e));
    } finally {
      setChecking(false);
    }
  }, [from, session]);

  // While the person picks in Google's window, check every few seconds whether they're done.
  useEffect(() => {
    if (!session || picked) return;
    const t = setInterval(check, session.pollMs);
    return () => clearInterval(t);
  }, [session, picked, check]);

  const pick = async () => {
    setError("");
    setPicked(null);
    setBlockedUri("");
    // Open the window straight away, while this still counts as a click; point it at the picker once it exists.
    const w = window.open("about:blank", "offload-picker", "popup,width=1040,height=820");
    try {
      if (session) await endPicking(from, session.id);
      const s = await startPicking(from);
      setSession(s);
      if (w && !w.closed) w.location.href = s.uri;
      else setBlockedUri(s.uri);
    } catch (e) {
      w?.close();
      setError(errText(e));
    }
  };

  const reset = () => {
    if (session) endPicking(from, session.id);
    setSession(null);
    setPicked(null);
  };

  const photos = picked?.filter((p) => !p.video).length || 0;
  const videos = picked?.filter((p) => p.video).length || 0;

  return (
    <div className="oa-ph">
      <p className="oa-hint">
        Google Photos can&rsquo;t hand photos to another account, so Offload copies the ones you pick into <b>{to.e}</b>&rsquo;s
        Google Photos, in an album called &ldquo;Copied from {from.e}&rdquo;. Your originals stay where they are: delete them once
        you&rsquo;ve checked the copies, and that frees the space. Up to {MAX_PICK.toLocaleString("en-US")} at a time.
      </p>
      {(!canPick || !canAdd) && (
        <ol className="oa-ph-steps">
          <li className={canPick ? "is-done" : ""}>
            <div>
              <b>See the photos you pick in {from.e}</b>
              <span>Only the ones you choose in Google&rsquo;s picker, nothing else.</span>
            </div>
            {canPick ? <span className="oa-ok">Allowed</span> : <button className="btn btn-main" onClick={() => allow(from.e, PICKER_SCOPE)}>Allow</button>}
          </li>
          <li className={canAdd ? "is-done" : ""}>
            <div>
              <b>Add photos to {to.e}&rsquo;s Google Photos</b>
              <span>Add-only: it can&rsquo;t see or change anything already there.</span>
            </div>
            {canAdd ? <span className="oa-ok">Allowed</span> : <button className="btn btn-main" onClick={() => allow(to.e, LIBRARY_SCOPE)}>Allow</button>}
          </li>
        </ol>
      )}
      {error && <p className="oa-note bad">{error}</p>}

      {canPick && canAdd && !session && (
        <button className="btn btn-main btn-lg" onClick={pick}>
          Pick photos in {from.e}
        </button>
      )}

      {session && !picked && (
        <div className="oa-ph-wait">
          <p className="oa-loading">Pick photos and videos in Google&rsquo;s window, then choose Done there. This page notices by itself.</p>
          {blockedUri && (
            <p className="oa-note">
              Your browser blocked the window.{" "}
              <a href={blockedUri} target="_blank" rel="noreferrer">
                Open Google&rsquo;s picker
              </a>
            </p>
          )}
          <div className="oa-actions">
            <button className="btn btn-quiet" onClick={check} disabled={checking}>
              {checking ? "Checking…" : "I've finished picking"}
            </button>
            <button className="oa-link" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {picked && (
        <div className="oa-ph-picked">
          {picked.length === 0 ? (
            <p className="oa-empty">Nothing was picked.</p>
          ) : (
            <>
              <p className="oa-gm-count">
                <b>{picked.length.toLocaleString("en-US")}</b> picked
                {photos > 0 && videos > 0 ? ` · ${count(photos, "photo")} and ${count(videos, "video")}` : ""}
              </p>
              <ul className="oa-list">
                {picked.slice(0, 30).map((p) => (
                  <li key={p.id}>
                    <FileIcon />
                    <span className="oa-name">{p.name}</span>
                    <span className="oa-tag">{p.video ? "Video" : "Photo"}</span>
                  </li>
                ))}
              </ul>
              {picked.length > 30 && <p className="oa-fine">And {count(picked.length - 30, "more")}.</p>}
            </>
          )}
          <div className="oa-actions">
            {picked.length > 0 && (
              <button className="btn btn-main" onClick={() => onCopy(from, to, session!.id)}>
                Copy {picked.length.toLocaleString("en-US")} to {to.e}
              </button>
            )}
            <button className="btn btn-quiet" onClick={pick}>
              Pick again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */

type Preview = Awaited<ReturnType<typeof gmailPreview>>;

function GmailTab({
  accounts,
  initial,
  stor,
  reloadKey,
  onTrash,
}: {
  accounts: Account[];
  initial: string;
  stor: Record<string, Store | { error: string } | "loading">;
  reloadKey: number;
  onTrash: (a: Account, s: GmailSearch, limit: number) => void;
}) {
  const [email, setEmail] = useState(initial || accounts[0].e);
  const acct = accounts.find((a) => a.e === email) || accounts[0];
  const [allowed, setAllowed] = useState(() => hasGmail(acct.e));
  const [filters, setFilters] = useState<GmailFilter[]>(["promotions"]);
  const [words, setWords] = useState("");
  const [subject, setSubject] = useState("");
  const [from, setFrom] = useState("");
  const [keepStarred, setKeepStarred] = useState(true);
  const [res, setRes] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const seq = useRef(0);

  useEffect(() => setAllowed(hasGmail(acct.e)), [acct.e]);
  const search = useMemo<GmailSearch>(() => ({ filters, words, subject, from, keepStarred }), [filters, words, subject, from, keepStarred]);
  let query = "";
  try {
    query = gmailQuery(search);
  } catch {
    /* nothing chosen yet */
  }

  useEffect(() => {
    setConfirm(false);
    if (!allowed || !query) {
      setRes(null);
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    setError("");
    const t = setTimeout(async () => {
      try {
        const r = await gmailPreview(acct, search);
        if (id === seq.current) setRes(r);
      } catch (e) {
        if (id !== seq.current) return;
        if (e instanceof ScopeNeededError) setAllowed(false);
        else setError(errText(e));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, acct.e, allowed, reloadKey]);

  const st = stor[acct.e];
  const ok = st && st !== "loading" && !("error" in st) ? st : null;
  const n = res ? (res.capped ? `all ${res.count.toLocaleString("en-US")}+` : res.count.toLocaleString("en-US")) : "";
  const toggleFilter = (k: GmailFilter) => setFilters((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  return (
    <div className="oa-gm">
      {accounts.length > 1 && (
        <label className="oa-gm-acct">
          <span>Clean up</span>
          <select value={acct.e} onChange={(e) => setEmail(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.e}>{a.e}</option>
            ))}
          </select>
          {ok && <em>Gmail and Photos use {ok.breakdown.gmail_and_photos} here</em>}
        </label>
      )}

      {!allowed ? (
        <div className="oa-gm-allow">
          <h3>Let Offload tidy Gmail for {acct.e}</h3>
          <p>
            Old promotions, newsletters and big attachments use the same storage as your Drive. Offload can search your mail,
            show the subject and sender of the newest matches, and move the conversations you confirm to Trash. It can&rsquo;t
            delete anything for good, and it never reads what your emails say.
          </p>
          <button
            className="btn btn-main"
            onClick={() =>
              allowGmail(acct.e)
                .then(() => setAllowed(true))
                .catch((e) => setError(errText(e)))
            }
          >
            Allow Gmail access
          </button>
          {error && <p className="oa-note bad">{error}</p>}
        </div>
      ) : (
        <>
          <div className="gchips oa-gm-chips" role="group" aria-label="Quick filters">
            {(Object.keys(GMAIL_FILTERS) as GmailFilter[]).map((k) => (
              <button key={k} className="gchip" aria-pressed={filters.includes(k)} onClick={() => toggleFilter(k)}>
                {GMAIL_FILTERS[k].label}
              </button>
            ))}
          </div>
          <div className="oa-gm-fields">
            <label>
              <span>Has the words</span>
              <input type="text" value={words} onChange={(e) => setWords(e.target.value)} placeholder="unsubscribe" />
            </label>
            <label>
              <span>Subject contains</span>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your order" />
            </label>
            <label>
              <span>From</span>
              <input type="text" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="news@shop.com" />
            </label>
          </div>
          <label className="oa-gm-keep">
            <input type="checkbox" className="ck" checked={keepStarred} onChange={(e) => setKeepStarred(e.target.checked)} />
            Leave starred and important emails alone
          </label>

          <div className="oa-gm-result" aria-live="polite">
            {!query ? (
              <p className="oa-empty">Pick a quick filter or type something to search for.</p>
            ) : loading && !res ? (
              <p className="oa-loading">Searching {acct.e}…</p>
            ) : error ? (
              <p className="oa-note bad">{error}</p>
            ) : res ? (
              <>
                <p className="oa-gm-count">
                  <b>{res.capped ? `${res.count.toLocaleString("en-US")}+` : res.count.toLocaleString("en-US")}</b>{" "}
                  {res.count === 1 && !res.capped ? "conversation matches" : "conversations match"}
                  {loading && <span className="oa-gm-busy"> · updating…</span>}
                  <a href={gmailSearchUrl(acct.e, res.query)} target="_blank" rel="noreferrer">
                    See them in Gmail
                  </a>
                </p>
                {res.items.length > 0 && (
                  <ul className="oa-list oa-gm-list">
                    {res.items.map((m) => (
                      <li key={m.id}>
                        <MailIcon />
                        <span className="oa-gm-main">
                          <span className="oa-gm-subj">{m.subject}</span>
                          <span className="oa-gm-sub">
                            {m.from}
                            {m.messages > 1 ? ` · ${m.messages} messages` : ""}
                          </span>
                        </span>
                        <span className="oa-date">{date(m.date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {res.count > res.items.length && <p className="oa-fine">Showing the newest {res.items.length}.</p>}
                {res.count > 0 && (
                  <div className="oa-actions">
                    {!confirm ? (
                      <button className="btn btn-main" onClick={() => setConfirm(true)}>
                        Move {n} to Trash
                      </button>
                    ) : (
                      <>
                        <button className="btn btn-danger" onClick={() => onTrash(acct, search, res.capped ? 0 : res.count)}>
                          Yes, move {n} conversations to Trash
                        </button>
                        <button className="btn btn-quiet" onClick={() => setConfirm(false)}>
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                )}
                {res.count > 0 && (
                  <p className="oa-fine">
                    Nothing is deleted for good: Gmail keeps Trash for 30 days, so you can restore anything. The space frees up
                    once the Trash is emptied.
                  </p>
                )}
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */

function Modal({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="oa-veil" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="oa-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg className="oa-ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.24 1.65.66L12.2 6H18.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="oa-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="oa-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </svg>
  );
}
