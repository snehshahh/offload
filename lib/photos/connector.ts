import { callGoogle, drive, LIBRARY_SCOPE, PICKER_SCOPE, type Account } from "@/lib/drive/api";
import { count, human } from "@/lib/drive/engine";
import { endPicking, listPicked, MAX_PICK, pollPicking, startPicking, type Picked } from "./engine";
import { relayChunk } from "./relay";

/**
 * Photos for the AI connector (server side).
 *
 * Two kinds of photos, because Google treats them differently:
 * - Photos and videos stored in Google Drive: Offload can read them all with its Drive access, so it can build a full
 *   month-by-month and year-by-year timeline and show previews of any of them.
 * - Google Photos: since March 2025 Google lets apps see only the photos a person picks in Google's own picker
 *   (Photos Picker API). So the person picks (up to 2,000 at a time, from a link), and Offload can then build a timeline of
 *   the picked ones, show previews, and copy them into another linked account's Google Photos (Photos Library API, add-only).
 */

const LIBRARY = "https://photoslibrary.googleapis.com/v1";
const MEDIA_Q = "'me' in owners and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')";
const MEDIA_FIELDS =
  "nextPageToken,files(id,mimeType,size,quotaBytesUsed,createdTime,imageMediaMetadata(time,cameraMake,cameraModel),videoMediaMetadata(durationMillis))";
/** Sample IDs kept per month, so a person can ask to see photos from any month. */
const SAMPLES = 4;
const MAX_CAMERAS = 40;
const PREVIEW_PX = 400;
export const MAX_PREVIEWS = 12;

/* ===================================================================== *
 * Permissions
 * ===================================================================== */

const RECONNECT =
  "Remove Offload in your AI app's connector settings, add it again, and leave the Google Photos boxes ticked on Google's screen.";

export function requirePicker(acct: Account) {
  if (!acct.ph?.includes("p")) {
    throw new Error(`${acct.e} hasn't allowed Offload to use the Google Photos picker (connections made before Google Photos support don't have it). ${RECONNECT}`);
  }
}

export function requireLibrary(acct: Account) {
  if (!acct.ph?.includes("a")) {
    throw new Error(`${acct.e} hasn't allowed Offload to add photos to its Google Photos. ${RECONNECT}`);
  }
}

/* ===================================================================== *
 * Timelines
 * ===================================================================== */

/** [photos, videos, bytes, video milliseconds] for one month, "YYYY-MM". */
type Bucket = [number, number, number, number];
type Sample = [string, number]; // [file or item id, index of the account it's in]

export type Tally = {
  months: Record<string, Bucket>;
  samples: Record<string, Sample[]>;
  cameras: Record<string, number>;
  /** Per linked account (index): [photos, videos, bytes]. */
  accts: Record<string, [number, number, number]>;
};

export const emptyTally = (): Tally => ({ months: {}, samples: {}, cameras: {}, accts: {} });

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

/** "2019:07:14 10:22:01" (EXIF) or an ISO date → "2019-07", or null if there's no real date. */
function monthKey(t?: string): string | null {
  const m = /^(\d{4})[:-](\d{2})/.exec(t || "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12) return null;
  return `${m[1]}-${m[2]}`;
}

function add(t: Tally, o: { month: string; video: boolean; bytes: number; ms: number; camera?: string; sample: Sample; acct: number }) {
  const b = (t.months[o.month] ||= [0, 0, 0, 0]);
  b[o.video ? 1 : 0]++;
  b[2] += o.bytes;
  b[3] += o.ms;
  const s = (t.samples[o.month] ||= []);
  if (s.length < SAMPLES) s.push(o.sample);
  if (o.camera) {
    if (t.cameras[o.camera] !== undefined || Object.keys(t.cameras).length < MAX_CAMERAS) t.cameras[o.camera] = (t.cameras[o.camera] || 0) + 1;
  }
  const a = (t.accts[o.acct] ||= [0, 0, 0]);
  a[o.video ? 1 : 0]++;
  a[2] += o.bytes;
}

const duration = (ms: number) => {
  const min = Math.round(ms / 60000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
};

/**
 * Turns a tally into what the AI shows: totals, one row per year, and one row per month (newest first).
 * `withSize` is false for Google Photos picks, which come without file sizes.
 */
export function summarize(t: Tally, accounts: Account[], o: { group_by: "month" | "year"; withSize: boolean; samples: boolean }) {
  const keys = Object.keys(t.months).sort().reverse();
  const tot: Bucket = [0, 0, 0, 0];
  const years: Record<string, Bucket> = {};
  for (const k of keys) {
    const b = t.months[k];
    const y = (years[k.slice(0, 4)] ||= [0, 0, 0, 0]);
    for (let i = 0; i < 4; i++) {
      tot[i] += b[i];
      y[i] += b[i];
    }
  }
  const row = (period: string, label: string, b: Bucket, extra: object = {}) => ({
    period,
    label,
    photos: b[0],
    videos: b[1],
    ...(o.withSize ? { size: human(b[2]) } : {}),
    ...(b[3] ? { video_length: duration(b[3]) } : {}),
    ...extra,
  });
  const sampleOf = (k: string) =>
    o.samples && t.samples[k]?.length
      ? { preview_ids: t.samples[k].map(([id, a]) => (accounts.length > 1 ? { id, account: accounts[a]?.e || "" } : { id })) }
      : {};
  const yearRows = Object.keys(years)
    .sort()
    .reverse()
    .map((y) => row(y, y, years[y], { months_with_photos: keys.filter((k) => k.startsWith(y)).length }));
  const monthRows = keys.map((k) => row(k, monthName(k), t.months[k], sampleOf(k)));

  const items = tot[0] + tot[1];
  const busiestMonth = [...keys].sort((a, b) => t.months[b][0] + t.months[b][1] - (t.months[a][0] + t.months[a][1]))[0];
  const busiestYear = Object.keys(years).sort((a, b) => years[b][0] + years[b][1] - (years[a][0] + years[a][1]))[0];
  const cameras = Object.entries(t.cameras)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, n]) => ({ camera: name, items: n }));
  const perAccount = Object.entries(t.accts).map(([i, [p, v, bytes]]) => ({
    account: accounts[Number(i)]?.e || "",
    photos: p,
    videos: v,
    ...(o.withSize ? { size: human(bytes) } : {}),
  }));

  return {
    items,
    totals: {
      photos: tot[0],
      videos: tot[1],
      ...(o.withSize ? { size: human(tot[2]) } : {}),
      ...(tot[3] ? { video_length: duration(tot[3]) } : {}),
      ...(keys.length ? { from: monthName(keys[keys.length - 1]), to: monthName(keys[0]) } : {}),
      ...(busiestMonth ? { busiest_month: `${monthName(busiestMonth)} (${count(t.months[busiestMonth][0] + t.months[busiestMonth][1], "item")})` } : {}),
      ...(busiestYear ? { busiest_year: `${busiestYear} (${count(years[busiestYear][0] + years[busiestYear][1], "item")})` } : {}),
    },
    ...(perAccount.length > 1 ? { per_account: perAccount } : {}),
    ...(cameras.length ? { cameras } : {}),
    by_year: yearRows,
    ...(o.group_by === "month" ? { by_month: monthRows } : {}),
  };
}

function headline(s: ReturnType<typeof summarize>, where: string, withSize: boolean) {
  if (!s.items) return `No photos or videos ${where}.`;
  const t = s.totals;
  const parts = [
    `${count(t.photos, "photo")} and ${count(t.videos, "video")} ${where}` + (withSize && "size" in t ? ` (${t.size})` : "") +
      ("from" in t ? `, from ${t.from} to ${t.to}` : "") + ".",
  ];
  if ("busiest_year" in t) parts.push(`Busiest year: ${t.busiest_year}; busiest month: ${t.busiest_month}.`);
  return parts.join(" ");
}

/* ===================================================================== *
 * Photos and videos in Google Drive
 * ===================================================================== */

export type DriveTimelineState = { k: "dtl"; a: number[]; tok: string | null; t: Tally; seen: number };

/** Scans every photo and video the accounts own in Drive, for up to `budgetMs`. Call again with the state until it's gone. */
export async function driveTimeline(accounts: Account[], targets: number[], prev: DriveTimelineState | undefined, budgetMs: number) {
  const st: DriveTimelineState = prev || { k: "dtl", a: [...targets], tok: null, t: emptyTally(), seen: 0 };
  const start = Date.now();
  let pages = 0; // always read at least one page, so every call makes progress
  while (st.a.length && (!pages++ || Date.now() - start < budgetMs)) {
    const idx = st.a[0];
    const acct = accounts[idx];
    if (!acct) {
      st.a.shift();
      continue;
    }
    const res = await drive(acct, "GET", "files", { q: MEDIA_Q, pageSize: 1000, pageToken: st.tok || undefined, fields: MEDIA_FIELDS });
    for (const f of res.files || []) {
      const img = f.imageMediaMetadata || {};
      const month = monthKey(img.time) || monthKey(f.createdTime);
      if (!month) continue;
      const camera = [img.cameraMake, img.cameraModel].filter(Boolean).join(" ").trim();
      add(st.t, {
        month,
        video: String(f.mimeType).startsWith("video/"),
        bytes: Number(f.quotaBytesUsed || f.size || 0),
        ms: Number(f.videoMediaMetadata?.durationMillis || 0),
        camera: camera || undefined,
        sample: [f.id, idx],
        acct: idx,
      });
      st.seen++;
    }
    st.tok = res.nextPageToken || null;
    if (!st.tok) st.a.shift();
  }
  return st;
}

export function driveTimelineResult(st: DriveTimelineState, accounts: Account[], targets: number[], group_by: "month" | "year") {
  const done = !st.a.length;
  const where = targets.length === 1 ? `in ${accounts[targets[0]].e}'s Google Drive` : "in Google Drive across your linked accounts";
  if (!done) {
    return {
      message: `Still counting: ${count(st.seen, "photo or video", "photos and videos")} so far ${where}. Carrying on…`,
      done: false,
    };
  }
  const s = summarize(st.t, accounts, { group_by, withSize: true, samples: group_by === "month" });
  return {
    message: headline(s, where, true),
    done: true,
    source: "google_drive",
    ...s,
    note:
      "Dates are when each photo was taken where the file says so, otherwise when it was added to Drive. " +
      "These are photos and videos stored in Google Drive; the Google Photos library is separate (use pick_google_photos for it). " +
      (group_by === "month" ? "preview_ids can be passed to show_photos." : ""),
  };
}

/* ===================================================================== *
 * Google Photos: picking
 * ===================================================================== */

/** A picking session, as handed to the AI: whose Google Photos it is, and Google's session id. */
export type PickToken = { k: "pick"; a: number; id: string };

export async function startPick(accounts: Account[], idx: number) {
  const acct = accounts[idx];
  requirePicker(acct);
  const s = await startPicking(acct);
  return { token: { k: "pick", a: idx, id: s.id } as PickToken, url: s.uri };
}

/** Whether the person has finished picking, and if so everything they picked. */
export async function picked(accounts: Account[], tok: PickToken): Promise<{ ready: false } | { ready: true; items: Picked[] }> {
  const acct = accounts[tok.a];
  if (!acct) throw new Error("That photos_session belongs to a different connection. Start again with pick_google_photos.");
  requirePicker(acct);
  const s = await pollPicking(acct, tok.id);
  if (!s.ready) return { ready: false };
  return { ready: true, items: await listPicked(acct, tok.id) };
}

export function pickedTally(items: Picked[], acctIdx: number): Tally {
  const t = emptyTally();
  items.forEach((it, i) => {
    const month = monthKey(it.time);
    if (!month) return;
    add(t, { month, video: it.video, bytes: 0, ms: 0, camera: it.camera, sample: [String(i), acctIdx], acct: acctIdx });
  });
  return t;
}

export function pickedResult(items: Picked[], accounts: Account[], acctIdx: number, group_by: "month" | "year") {
  const s = summarize(pickedTally(items, acctIdx), accounts, { group_by, withSize: false, samples: false });
  const where = `picked from ${accounts[acctIdx].e}'s Google Photos`;
  return {
    message: headline(s, where, false),
    source: "google_photos_picked",
    ...s,
    note:
      `Google only lets apps see the photos a person picks (up to ${MAX_PICK.toLocaleString("en-US")} at a time), so this covers the picked ones, not the whole library. ` +
      "Google Photos doesn't give file sizes for picked items. Pass this photos_session to show_photos (optionally with a period such as 2019 or 2019-07) to see them, or to copy_google_photos to copy them to another account.",
  };
}

/** The picked items in `period` ("2019" or "2019-07"), or all of them. */
export function inPeriod(items: Picked[], period?: string) {
  if (!period) return items;
  return items.filter((it) => (monthKey(it.time) || "").startsWith(period));
}

/* ===================================================================== *
 * Previews
 * ===================================================================== */

export type Preview = { name: string; taken?: string; account: string; video: boolean; data: string; mime: string };

async function fetchImage(url: string, token: string): Promise<{ data: string; mime: string } | null> {
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!mime.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1_500_000) return null;
    return { data: buf.toString("base64"), mime };
  } catch {
    return null;
  }
}

/** Small previews of picked Google Photos items (videos show their first frame). */
export async function pickedPreviews(acct: Account, items: Picked[], token: (a: Account, scope: string) => Promise<string>): Promise<Preview[]> {
  const t = await token(acct, PICKER_SCOPE);
  const out = await Promise.all(
    items.map(async (it): Promise<Preview | null> => {
      const img = await fetchImage(`${it.url}=w${PREVIEW_PX}-h${PREVIEW_PX}`, t);
      return img ? { name: it.name, taken: it.time, account: acct.e, video: it.video, ...img } : null;
    })
  );
  return out.filter((x): x is Preview => !!x);
}

const ID_RE = /^[A-Za-z0-9_-]{5,}$/;

/** Small previews of Drive photos and videos by file ID. Each ID is looked up in `accounts` until one can see it. */
export async function drivePreviews(accounts: Account[], ids: string[], token: (a: Account) => Promise<string>) {
  const missing: string[] = [];
  const out = await Promise.all(
    ids.map(async (id) => {
      if (!ID_RE.test(id)) {
        missing.push(id);
        return null;
      }
      for (const acct of accounts) {
        try {
          const f = await drive(acct, "GET", `files/${id}`, {
            fields: "id,name,mimeType,thumbnailLink,createdTime,imageMediaMetadata(time)",
            supportsAllDrives: true,
          });
          if (!f.thumbnailLink) break;
          const url = String(f.thumbnailLink).replace(/=s\d+$/, `=s${PREVIEW_PX}`);
          const img = await fetchImage(url, await token(acct));
          if (!img) break;
          const taken = monthKey(f.imageMediaMetadata?.time) ? String(f.imageMediaMetadata.time).replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3") : f.createdTime;
          return { name: f.name, taken, account: acct.e, video: String(f.mimeType).startsWith("video/"), ...img } as Preview;
        } catch {
          /* not in this account: try the next */
        }
      }
      missing.push(id);
      return null;
    })
  );
  return { previews: out.filter((x): x is Preview => !!x), missing };
}

/* ===================================================================== *
 * Google Photos: copying picked items to another account
 * ===================================================================== */

/** Where a copy job has got to. `next` is the next picked item to start; `open` are items stopped halfway. */
export type CopyState = {
  k: "pcopy";
  a: number; // source account
  to: number; // receiving account
  id: string; // picking session
  next: number;
  open: { i: number; up: string | null; off: number }[];
  album: { id: string; url: string } | null;
  total: number;
  copied: number;
  failed: number;
  bytes: number;
  errors: { name: string; detail: string }[];
};

const BATCH = 50;
const PARALLEL = 4;

/**
 * Copies picked items from the source account's Google Photos into `to`'s, into an album "Copied from <source>",
 * for up to `budgetMs`. Big videos can stop halfway and carry on next call. Originals stay where they are.
 */
export async function copyPickedServer(
  accounts: Account[],
  st: CopyState,
  budgetMs: number,
  token: (a: Account, scope: string, force?: boolean) => Promise<string>
) {
  const from = accounts[st.a];
  const to = accounts[st.to];
  if (!from || !to) throw new Error("That copy belongs to a different connection. Start again with pick_google_photos.");
  requirePicker(from);
  requireLibrary(to);
  const items = await listPicked(from, st.id);
  st.total = items.length;
  const start = Date.now();
  let progressed = false; // every call copies at least one piece before it can stop
  const outOfTime = () => progressed && Date.now() - start > budgetMs;

  if (!st.album && (st.next < items.length || st.open.length)) {
    try {
      const a = await callGoogle(LIBRARY, LIBRARY_SCOPE, to, "POST", "albums", {}, { album: { title: `Copied from ${from.e}` } });
      st.album = { id: a.id, url: a.productUrl || "" };
    } catch {
      st.album = null; // copy without an album rather than not at all
    }
  }

  const fail = (it: Picked | undefined, detail: string) => {
    st.failed++;
    if (st.errors.length < 10) st.errors.push({ name: it?.name || "an item", detail });
  };
  const ready: { it: Picked; token: string }[] = [];
  const stopped: CopyState["open"] = [];
  const queue = [...st.open];
  st.open = [];

  const copyOne = async (job: { i: number; up: string | null; off: number }) => {
    const it = items[job.i];
    if (!it) return fail(undefined, "It's no longer in the picked set.");
    let up = job.up;
    let off = job.off;
    let retried = false;
    for (;;) {
      if (outOfTime() && off > 0) {
        stopped.push({ i: job.i, up, off });
        return;
      }
      const r = await relayChunk({
        src: it.url,
        video: it.video,
        mime: it.mime,
        srcToken: await token(from, PICKER_SCOPE),
        destToken: await token(to, LIBRARY_SCOPE),
        upload: up,
        offset: off,
      });
      if (!r.ok) {
        if (r.status === 401 && !retried) {
          retried = true; // the sign-in ran out: get a fresh one and try that piece again
          if (r.side === "upload") await token(to, LIBRARY_SCOPE, true);
          else await token(from, PICKER_SCOPE, true);
          continue;
        }
        return fail(it, r.error);
      }
      progressed = true;
      up = r.upload;
      off = r.offset;
      if (r.done) {
        ready.push({ it, token: r.token || "" });
        st.bytes += r.total;
        return;
      }
    }
  };

  const worker = async () => {
    for (;;) {
      if (outOfTime()) return;
      const job = queue.shift() || (st.next < items.length ? { i: st.next++, up: null, off: 0 } : null);
      if (!job) return;
      try {
        await copyOne(job);
      } catch (e) {
        fail(items[job.i], e instanceof Error ? e.message : String(e));
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  st.open = [...queue, ...stopped];

  // Add everything uploaded in this call to Google Photos, 50 at a time.
  for (let i = 0; i < ready.length; i += BATCH) {
    const batch = ready.slice(i, i + BATCH);
    const body: any = { newMediaItems: batch.map((b) => ({ simpleMediaItem: { uploadToken: b.token, fileName: b.it.name } })) };
    if (st.album) body.albumId = st.album.id;
    let res: any;
    try {
      try {
        res = await callGoogle(LIBRARY, LIBRARY_SCOPE, to, "POST", "mediaItems:batchCreate", {}, body);
      } catch (e) {
        if (!body.albumId) throw e;
        delete body.albumId; // the album may have been deleted: add them without it
        st.album = null;
        res = await callGoogle(LIBRARY, LIBRARY_SCOPE, to, "POST", "mediaItems:batchCreate", {}, body);
      }
    } catch (e) {
      for (const b of batch) fail(b.it, `Google Photos didn't add it: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const byToken = new Map<string, any>((res.newMediaItemResults || []).map((r: any) => [r.uploadToken, r]));
    for (const b of batch) {
      if (byToken.get(b.token)?.mediaItem) st.copied++;
      else fail(b.it, byToken.get(b.token)?.status?.message || "Google Photos didn't accept it.");
    }
  }

  const done = st.next >= items.length && !st.open.length;
  if (done) await endPicking(from, st.id);
  const finished = st.copied + st.failed;
  const message = done
    ? [
        st.copied
          ? `Copied ${count(st.copied, "photo or video", "photos and videos")} (${human(st.bytes)}) from ${from.e} to ${to.e}'s Google Photos` +
            (st.album ? `, in the album "Copied from ${from.e}".` : ".")
          : `Nothing was copied to ${to.e}.`,
        ...(st.failed ? [`${count(st.failed, "item")} couldn't be copied.`] : []),
        ...(st.copied ? [`The originals are still in ${from.e}. Check the copies, then delete the originals in Google Photos to free the space there.`] : []),
      ].join(" ")
    : `Still copying to ${to.e}: ${finished.toLocaleString("en-US")} of ${count(st.total, "item")} done (${human(st.bytes)}). Carrying on…`;
  return { done, message };
}

export function copyResult(st: CopyState, accounts: Account[], done: boolean, message: string) {
  return {
    message,
    done,
    from: accounts[st.a]?.e,
    to: accounts[st.to]?.e,
    total: st.total,
    copied: st.copied,
    failed: st.failed,
    copied_size: human(st.bytes),
    ...(st.album?.url ? { album: st.album.url } : {}),
    ...(st.errors.length ? { problems: st.errors } : {}),
  };
}
