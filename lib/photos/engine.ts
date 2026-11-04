import { callGoogle, LIBRARY_SCOPE, PICKER_SCOPE, type Account } from "@/lib/drive/api";
import { count, human } from "@/lib/drive/engine";
import type { RelayRequest, RelayResponse } from "./relay";

/**
 * Google Photos copy for the Offload web app. Google Photos has no ownership
 * transfer, so photos are copied: the source account picks them in Google's own picker (Photos Picker API), each one
 * is copied in pieces into the receiving account's Google Photos (Photos Library API, add-only), and they're gathered
 * in an album "Copied from <email>". The originals stay where they are; the person deletes them afterwards.
 * Everything here runs in the browser except moving the bytes, which goes through /api/photos/copy (see relay.ts).
 */

const PICKER = "https://photospicker.googleapis.com/v1";
const LIBRARY = "https://photoslibrary.googleapis.com/v1";
export const MAX_PICK = 2000;
const URL_TTL_MS = 45 * 60 * 1000; // picked items' download links last 60 minutes
const BATCH = 20;

const durMs = (s: unknown, fallback: number) => {
  const m = /^([\d.]+)s$/.exec(String(s || ""));
  return m ? Math.max(1000, Number(m[1]) * 1000) : fallback;
};

/** Opens a picking session for `acct`. Send the person to `uri`; they pick there. */
export async function startPicking(acct: Account) {
  const s = await callGoogle(PICKER, PICKER_SCOPE, acct, "POST", "sessions", {}, { pickingConfig: { maxItemCount: String(MAX_PICK) } });
  return { id: String(s.id), uri: `${s.pickerUri}/autoclose`, pollMs: durMs(s.pollingConfig?.pollInterval, 4000) };
}

/** Whether the person has finished picking. */
export async function pollPicking(acct: Account, id: string) {
  const s = await callGoogle(PICKER, PICKER_SCOPE, acct, "GET", `sessions/${encodeURIComponent(id)}`);
  return { ready: !!s.mediaItemsSet, pollMs: durMs(s.pollingConfig?.pollInterval, 4000) };
}

export type Picked = { id: string; name: string; mime: string; video: boolean; url: string };

/** Everything picked in the session, with fresh download links. */
export async function listPicked(acct: Account, id: string): Promise<Picked[]> {
  const out: Picked[] = [];
  let pageToken: string | undefined;
  do {
    const res = await callGoogle(PICKER, PICKER_SCOPE, acct, "GET", "mediaItems", { sessionId: id, pageSize: 100, pageToken });
    for (const m of res.mediaItems || []) {
      const f = m.mediaFile || {};
      out.push({ id: m.id, name: f.filename || m.id, mime: f.mimeType || "application/octet-stream", video: m.type === "VIDEO", url: f.baseUrl });
    }
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

/** Done with a session: let Google drop it. */
export async function endPicking(acct: Account, id: string) {
  try {
    await callGoogle(PICKER, PICKER_SCOPE, acct, "DELETE", `sessions/${encodeURIComponent(id)}`);
  } catch {
    /* sessions expire on their own */
  }
}

export type CopyProgress = {
  message: string;
  done: boolean;
  total: number;
  copied: number;
  failed: number;
  bytes: number;
  current: string;
  /** Which item (1-based) is being copied right now. */
  at: number;
  albumUrl: string;
  errors: { id: string; name: string; detail: string }[];
};

type Album = { id: string; url: string };
const albumKey = (to: string, from: string) => `offload.album.v1:${to}:${from}`;

function savedAlbum(to: string, from: string): Album | null {
  try {
    return JSON.parse(localStorage.getItem(albumKey(to, from)) || "null");
  } catch {
    return null;
  }
}

function saveAlbum(to: string, from: string, a: Album | null) {
  try {
    if (a) localStorage.setItem(albumKey(to, from), JSON.stringify(a));
    else localStorage.removeItem(albumKey(to, from));
  } catch {
    /* a new album next time is fine */
  }
}

export type CopyDeps = {
  /** An access token for `acct` that covers `scope`; `force` = the last one was rejected. */
  token: (acct: Account, scope: string, force?: boolean) => Promise<string>;
  /** Sends one piece through the relay. */
  relay: (r: RelayRequest) => Promise<RelayResponse>;
  onProgress: (p: CopyProgress) => void;
};

/** Copies everything picked in `sessionId` from `from`'s Google Photos into `to`'s, into the album. */
export async function copyPicked(from: Account, to: Account, sessionId: string, deps: CopyDeps): Promise<CopyProgress> {
  let items = await listPicked(from, sessionId);
  let listedAt = Date.now();
  const p: CopyProgress = { message: "", done: false, total: items.length, copied: 0, failed: 0, bytes: 0, current: "", at: 0, albumUrl: "", errors: [] };
  const fail = (it: Picked, detail: string) => {
    p.failed++;
    if (p.errors.length < 50) p.errors.push({ id: it.id, name: it.name, detail });
  };
  const say = () => {
    p.message = p.done
      ? doneMessage(p, from.e, to.e)
      : p.at
        ? `Copying ${p.at.toLocaleString("en-US")} of ${count(p.total, "item")} to ${to.e}${p.current ? `: ${p.current}` : ""}…`
        : `Getting ready to copy ${count(p.total, "item")} to ${to.e}…`;
    deps.onProgress({ ...p, errors: [...p.errors] });
  };

  // The album to gather them in (made by Offload, so add-only access can use it).
  let album = savedAlbum(to.e, from.e);
  if (!album) {
    try {
      const a = await callGoogle(LIBRARY, LIBRARY_SCOPE, to, "POST", "albums", {}, { album: { title: `Copied from ${from.e}` } });
      album = { id: a.id, url: a.productUrl || "" };
      saveAlbum(to.e, from.e, album);
    } catch {
      album = null; // copy without an album rather than not at all
    }
  }
  p.albumUrl = album?.url || "";

  const pending: { it: Picked; token: string; bytes: number }[] = [];
  const flush = async () => {
    const batch = pending.splice(0, BATCH);
    if (!batch.length) return;
    const body: any = { newMediaItems: batch.map((b) => ({ simpleMediaItem: { uploadToken: b.token, fileName: b.it.name } })) };
    if (album) body.albumId = album.id;
    let res: any;
    try {
      res = await callGoogle(LIBRARY, LIBRARY_SCOPE, to, "POST", "mediaItems:batchCreate", {}, body);
    } catch (e) {
      if (!album) throw e;
      // the album may have been deleted: add them without it, and forget it
      delete body.albumId;
      res = await callGoogle(LIBRARY, LIBRARY_SCOPE, to, "POST", "mediaItems:batchCreate", {}, body);
      saveAlbum(to.e, from.e, null);
      album = null;
      p.albumUrl = "";
    }
    const byToken = new Map<string, any>((res.newMediaItemResults || []).map((r: any) => [r.uploadToken, r]));
    for (const b of batch) {
      const r = byToken.get(b.token);
      if (r?.mediaItem) {
        p.copied++;
        p.bytes += b.bytes;
      } else fail(b.it, r?.status?.message || "Google Photos didn't accept it.");
    }
  };

  say();
  for (let i = 0; i < items.length; i++) {
    let it = items[i];
    p.at = i + 1;
    p.current = it.name;
    say();
    let upload: string | null = null;
    let offset = 0;
    let retriedLink = false;
    let retriedSignIn = false;
    try {
      for (;;) {
        if (Date.now() - listedAt > URL_TTL_MS) {
          items = await listPicked(from, sessionId); // fresh download links
          listedAt = Date.now();
          it = items.find((x) => x.id === it.id) || it;
        }
        const r = await deps.relay({
          src: it.url,
          video: it.video,
          mime: it.mime,
          srcToken: await deps.token(from, PICKER_SCOPE),
          destToken: await deps.token(to, LIBRARY_SCOPE),
          upload,
          offset,
        });
        if (!r.ok) {
          if (r.status === 401 && !retriedSignIn) {
            retriedSignIn = true;
            await deps.token(r.side === "upload" ? to : from, r.side === "upload" ? LIBRARY_SCOPE : PICKER_SCOPE, true);
            continue;
          }
          if (r.side === "download" && (r.status === 403 || r.status === 404) && !retriedLink) {
            retriedLink = true; // the download link may have run out
            items = await listPicked(from, sessionId);
            listedAt = Date.now();
            it = items.find((x) => x.id === it.id) || it;
            continue;
          }
          throw new Error(r.error);
        }
        upload = r.upload;
        offset = r.offset;
        if (r.done) {
          pending.push({ it, token: r.token || "", bytes: r.total });
          break;
        }
        p.current = `${it.name} (${human(offset)} of ${human(r.total)})`;
        say();
      }
    } catch (e) {
      fail(it, e instanceof Error ? e.message : String(e));
    }
    if (pending.length >= BATCH) await flush();
  }
  while (pending.length) await flush();
  p.done = true;
  p.current = "";
  say();
  await endPicking(from, sessionId);
  return p;
}

function doneMessage(p: CopyProgress, from: string, to: string): string {
  const parts: string[] = [];
  parts.push(
    p.copied
      ? `Copied ${count(p.copied, "photo or video", "photos and videos")} (${human(p.bytes)}) to ${to}'s Google Photos` +
          (p.albumUrl ? `, in the album "Copied from ${from}".` : ".")
      : `Nothing was copied to ${to}.`
  );
  if (p.failed) parts.push(`${count(p.failed, "item")} couldn't be copied: see problems.`);
  if (p.copied) parts.push(`Your originals are still in ${from}. Check the copies, then delete the originals in Google Photos to free the space there.`);
  return parts.join(" ");
}

/** Sends one piece through this site's relay. */
export async function relayViaSite(r: RelayRequest): Promise<RelayResponse> {
  const res = await fetch("/api/photos/copy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(r) });
  try {
    return (await res.json()) as RelayResponse;
  } catch {
    return { ok: false, status: res.status, side: "request", error: `The copy service didn't answer (HTTP ${res.status}).` };
  }
}
