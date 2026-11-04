/**
 * The one piece of Offload's Google Photos copy that runs on the server: moving bytes. Browsers can't read the
 * headers Google Photos uses for piece-by-piece downloads (Content-Range) and uploads (X-Goog-Upload-URL), so each
 * call downloads one piece of a picked photo from the source account and hands it straight to the receiving
 * account's upload. Nothing is stored or looked at, and the relay only talks to Google Photos' own addresses.
 */

export const CHUNK = 16 * 1024 * 1024; // a multiple of 256 KB, as resumable uploads need
const WHOLE_MAX = 100 * 1024 * 1024; // when Google won't send pieces, the most we take in one go
const LIBRARY_UPLOADS = "https://photoslibrary.googleapis.com/v1/uploads";

export type RelayRequest = {
  src: string; // the picked item's baseUrl
  video: boolean;
  mime: string;
  srcToken: string; // source account, photospicker.mediaitems.readonly
  destToken: string; // receiving account, photoslibrary.appendonly
  upload?: string | null; // resumable upload address, once started
  offset: number;
};

export type RelayResponse =
  | { ok: true; upload: string | null; offset: number; total: number; done: boolean; token?: string }
  | { ok: false; status: number; side: "download" | "upload" | "request"; error: string };

const bad = (error: string, status = 400, side: "download" | "upload" | "request" = "request"): RelayResponse => ({ ok: false, status, side, error });

function validSrc(u: string): URL | null {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && (url.hostname === "lh3.googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com")) && !url.hash
      ? url
      : null;
  } catch {
    return null;
  }
}

function validUpload(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname === "photoslibrary.googleapis.com" && url.pathname.startsWith("/v1/uploads");
  } catch {
    return false;
  }
}

export async function relayChunk(r: RelayRequest): Promise<RelayResponse> {
  if (!r || typeof r !== "object") return bad("Send the request as JSON.");
  const src = validSrc(String(r.src || ""));
  if (!src) return bad("That isn't a Google Photos download address.");
  if (r.upload && !validUpload(r.upload)) return bad("That isn't a Google Photos upload address.");
  const offset = Number(r.offset);
  if (!Number.isSafeInteger(offset) || offset < 0) return bad("Bad offset.");
  for (const t of [r.srcToken, r.destToken]) if (typeof t !== "string" || !t || t.length > 4096) return bad("Missing sign-in.");
  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(String(r.mime || "")) ? r.mime : "application/octet-stream";

  // 1. one piece from the source account
  const down = await fetch(`${src.href}${r.video ? "=dv" : "=d"}`, {
    headers: { authorization: `Bearer ${r.srcToken}`, range: `bytes=${offset}-${offset + CHUNK - 1}` },
  });
  if (down.status !== 200 && down.status !== 206) return bad(`Download failed (HTTP ${down.status}).`, down.status, "download");
  let total: number;
  if (down.status === 206) {
    const m = /bytes\s+(\d+)-(\d+)\/(\d+)/i.exec(down.headers.get("content-range") || "");
    if (!m || Number(m[1]) !== offset) return bad("Google Photos sent an unexpected piece.", 502, "download");
    total = Number(m[3]);
  } else {
    if (offset) return bad("The download started over halfway through. Pick this one again.", 502, "download");
    const len = Number(down.headers.get("content-length") || 0);
    if (len > WHOLE_MAX) return bad("Too big to copy: Google sent it in one piece, and the most Offload takes in one go is 100 MB.", 413, "download");
    total = len;
  }
  const bytes = new Uint8Array(await down.arrayBuffer());
  if (down.status === 200) total = bytes.length;
  const last = offset + bytes.length >= total;
  const auth = { authorization: `Bearer ${r.destToken}` };

  // 2. hand it to the receiving account
  if (!offset && last) {
    const up = await fetch(LIBRARY_UPLOADS, {
      method: "POST",
      headers: { ...auth, "content-type": "application/octet-stream", "x-goog-upload-content-type": mime, "x-goog-upload-protocol": "raw" },
      body: bytes,
    });
    if (!up.ok) return bad(`Upload failed (HTTP ${up.status}).`, up.status, "upload");
    return { ok: true, upload: null, offset: bytes.length, total, done: true, token: (await up.text()).trim() };
  }
  let upload = r.upload || null;
  if (!upload) {
    const start = await fetch(LIBRARY_UPLOADS, {
      method: "POST",
      headers: { ...auth, "content-length": "0", "x-goog-upload-command": "start", "x-goog-upload-protocol": "resumable", "x-goog-upload-content-type": mime, "x-goog-upload-raw-size": String(total) },
    });
    upload = start.headers.get("x-goog-upload-url");
    if (!start.ok || !upload || !validUpload(upload)) return bad(`Couldn't start the upload (HTTP ${start.status}).`, start.status || 502, "upload");
  }
  const put = await fetch(upload, {
    method: "POST",
    headers: { ...auth, "content-type": "application/octet-stream", "x-goog-upload-command": last ? "upload, finalize" : "upload", "x-goog-upload-offset": String(offset) },
    body: bytes,
  });
  if (!put.ok) return bad(`Upload failed (HTTP ${put.status}).`, put.status, "upload");
  const next = offset + bytes.length;
  return last ? { ok: true, upload, offset: next, total, done: true, token: (await put.text()).trim() } : { ok: true, upload, offset: next, total, done: false };
}
