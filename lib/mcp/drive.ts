import { deflateRawSync, inflateRawSync } from "node:zlib";
import { drive, DriveError, type Account } from "./google";

/**
 * Drive work for the MCP connector, ported from apps-script/Code.gs.
 *
 * The connector holds every linked account (2 to 5), so a transfer is requested by the sending account and
 * accepted by the receiving one in the same step: files move without anyone opening the app.
 * Accepted items whose old folder the receiver can't see are filed into
 * "Transferred from <sender>" in the receiver's My Drive, exactly as the web app does.
 *
 * Every moved item is tagged with private appProperties (offloadedFrom, offloadedAt) so the connector
 * remembers, on the file itself, which account it came from and when. Only this OAuth client can see them.
 */

export const FOLDER_MIME = "application/vnd.google-apps.folder";
const FILE_FIELDS =
  "id,name,mimeType,ownedByMe,parents,quotaBytesUsed,size,owners(emailAddress),permissions(id,emailAddress,role,pendingOwner)";
const LIST_FIELDS =
  "nextPageToken,files(id,name,mimeType,size,quotaBytesUsed,modifiedTime,webViewLink,appProperties,owners(emailAddress),permissions(emailAddress,pendingOwner))";
const ID_RE = /^[A-Za-z0-9_-]{5,}$/;
const CONCURRENCY = 5;

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  ownedByMe?: boolean;
  parents?: string[];
  size?: string;
  quotaBytesUsed?: string;
  modifiedTime?: string;
  webViewLink?: string;
  appProperties?: Record<string, string>;
  owners?: { emailAddress?: string }[];
  permissions?: { id?: string; emailAddress?: string; role?: string; pendingOwner?: boolean }[];
};

export function requireId(id: string) {
  if (!ID_RE.test(id)) throw new Error(`"${id}" isn't a Google Drive ID.`);
}

export function sizeOf(f: DriveFile): number {
  return Number(f.quotaBytesUsed || f.size || 0);
}

export function human(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")} ${units[i]}`;
}

function ownerOf(f: DriveFile): string {
  return (f.owners?.[0]?.emailAddress || "unknown").toLowerCase();
}

function qEsc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Opaque continuation tokens: compressed JSON. They hold only Drive IDs and counters, nothing secret. */
export function packCursor(state: object): string {
  return deflateRawSync(Buffer.from(JSON.stringify(state))).toString("base64url");
}

export function unpackCursor<T>(token: string, kind: string): T {
  try {
    const state = JSON.parse(inflateRawSync(Buffer.from(token, "base64url")).toString("utf8"));
    if (state.k !== kind) throw new Error();
    return state as T;
  } catch {
    throw new Error("That continue_token isn't valid. Start again without it.");
  }
}

/** Runs `fn` over `items`, at most CONCURRENCY at a time. */
async function pool<T>(items: T[], fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

/* ===================================================================== *
 * Storage
 * ===================================================================== */

export async function storage(acct: Account) {
  const res = await drive(acct, "GET", "about", { fields: "storageQuota" });
  const q = res.storageQuota || {};
  const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
  const limit = num(q.limit);
  const usage = num(q.usage) || 0;
  const inDrive = num(q.usageInDrive) || 0;
  const free = limit === null ? null : Math.max(0, limit - usage);
  const percent = limit ? Math.round((usage / limit) * 100) : null;
  const status = limit === null ? "unlimited" : percent! >= 100 ? "full" : percent! >= 90 ? "almost full" : "ok";
  return {
    email: acct.e,
    summary:
      limit === null
        ? `${acct.e}: ${human(usage)} used, unlimited plan`
        : `${acct.e}: ${human(usage)} of ${human(limit)} used (${percent}%), ${human(free!)} free`,
    status,
    used: human(usage),
    total: limit === null ? "unlimited" : human(limit),
    free: free === null ? "unlimited" : human(free),
    percent_used: percent,
    breakdown: {
      drive: human(inDrive),
      of_which_drive_trash: human(num(q.usageInDriveTrash) || 0),
      gmail_and_photos: human(Math.max(0, usage - inDrive)),
    },
    bytes: { used: usage, total: limit, free },
  };
}

/* ===================================================================== *
 * Finding files
 * ===================================================================== */

export type FindOpts = {
  kind: "all" | "images" | "videos" | "media" | "documents" | "folders";
  min_size_mb?: number;
  name_contains?: string;
  folder_id?: string;
  sort: "largest" | "newest" | "name";
  limit: number;
  page_token?: string;
  /** Only items Offload moved into this account from any of these other accounts. */
  moved_from?: string[];
};

export async function findFiles(acct: Account, o: FindOpts) {
  let q = "'me' in owners and trashed = false";
  if (o.kind === "folders") q += ` and mimeType = '${FOLDER_MIME}'`;
  else q += ` and mimeType != '${FOLDER_MIME}'`;
  if (o.kind === "images") q += " and mimeType contains 'image/'";
  if (o.kind === "videos") q += " and mimeType contains 'video/'";
  if (o.kind === "media") q += " and (mimeType contains 'image/' or mimeType contains 'video/')";
  if (o.kind === "documents") q += " and mimeType contains 'application/vnd.google-apps.'";
  if (o.name_contains) q += ` and name contains '${qEsc(o.name_contains)}'`;
  if (o.moved_from?.length) {
    const any = o.moved_from.map((e) => `appProperties has { key='offloadedFrom' and value='${qEsc(e)}' }`).join(" or ");
    q += ` and (${any})`;
  }
  if (o.folder_id) {
    requireId(o.folder_id);
    q += ` and '${o.folder_id}' in parents`;
  }
  const sort = o.kind === "folders" && o.sort === "largest" ? "name" : o.sort;
  const orderBy = sort === "largest" ? "quotaBytesUsed desc" : sort === "newest" ? "modifiedTime desc" : "name";
  const minBytes = Math.max(0, o.min_size_mb || 0) * 1024 * 1024;

  const items: ReturnType<typeof slim>[] = [];
  const start = Date.now();
  let pageToken = o.page_token;
  let next: string | undefined;
  do {
    const res = await drive(acct, "GET", "files", {
      q,
      orderBy,
      pageSize: Math.min(100, Math.max(o.limit, 25)),
      pageToken,
      fields: LIST_FIELDS,
    });
    let reachedSmall = false;
    for (const f of (res.files || []) as DriveFile[]) {
      if (minBytes && sizeOf(f) < minBytes) {
        if (sort === "largest") {
          reachedSmall = true; // sorted biggest-first: everything after is smaller
          break;
        }
        continue;
      }
      if (items.length < o.limit) items.push(slim(f));
    }
    next = reachedSmall ? undefined : res.nextPageToken;
    pageToken = next;
  } while (pageToken && items.length < o.limit && Date.now() - start < 20_000);

  const total = items.reduce((s, f) => s + f.size_bytes, 0);
  return {
    account: acct.e,
    count: items.length,
    total_size: human(total),
    items,
    next_page_token: next || null,
  };
}

function slim(f: DriveFile) {
  const pending = (f.permissions || []).find((p) => p.pendingOwner);
  return {
    id: f.id,
    name: f.name,
    type: f.mimeType === FOLDER_MIME ? "folder" : f.mimeType,
    size: f.mimeType === FOLDER_MIME ? "use folder_size" : human(sizeOf(f)),
    size_bytes: sizeOf(f),
    modified: f.modifiedTime || "",
    link: f.webViewLink || "",
    ...(pending ? { pending_transfer_to: pending.emailAddress || "" } : {}),
    ...(f.appProperties?.offloadedFrom
      ? { moved_here_from: f.appProperties.offloadedFrom, moved_on: f.appProperties.offloadedAt || "" }
      : {}),
  };
}

/* ===================================================================== *
 * Folder size
 * ===================================================================== */

type SizeState = { k: "size"; queue: string[]; token: string | null; bytes: number; files: number; notOwned: number };

/** Space the files you own inside a folder (all subfolders included) take up: what a transfer would free. */
export async function folderSize(acct: Account, folderId: string, cursor?: string) {
  let state: SizeState;
  if (cursor) state = unpackCursor<SizeState>(cursor, "size");
  else {
    requireId(folderId);
    state = { k: "size", queue: [folderId], token: null, bytes: 0, files: 0, notOwned: 0 };
  }
  const start = Date.now();
  while (state.queue.length && Date.now() - start < 30_000) {
    const res = await drive(acct, "GET", "files", {
      q: `'${state.queue[0]}' in parents and trashed = false`,
      pageSize: 1000,
      pageToken: state.token || undefined,
      fields: "nextPageToken,files(id,mimeType,ownedByMe,quotaBytesUsed,size)",
    });
    for (const f of (res.files || []) as DriveFile[]) {
      if (f.mimeType === FOLDER_MIME) state.queue.push(f.id);
      else if (f.ownedByMe) {
        state.bytes += sizeOf(f);
        state.files++;
      } else state.notOwned++;
    }
    if (res.nextPageToken) state.token = res.nextPageToken;
    else {
      state.queue.shift();
      state.token = null;
    }
  }
  const done = !state.queue.length;
  return {
    folder_id: folderId,
    size: human(state.bytes),
    size_bytes: state.bytes,
    files_you_own: state.files,
    files_owned_by_others: state.notOwned,
    done,
    ...(done ? {} : { continue_token: packCursor(state), note: "Big folder: call folder_size again with continue_token." }),
  };
}

/* ===================================================================== *
 * Transfer: request with the sender, accept with the receiver
 * ===================================================================== */

type Work = { id: string; root: boolean };

type TransferState = {
  k: "transfer";
  f: string; // sender email
  t: string; // receiver email
  todo: Work[]; // items to fetch and move
  // Folders whose contents still have to be listed. loose: the receiver won't be able to see this folder,
  // so whatever comes out of it has to be filed into "Transferred from <sender>".
  queue: { id: string; loose: boolean }[];
  cur: { id: string; pt: string | null; loose: boolean } | null;
  inbox: string | null; // receiver's "Transferred from <sender>" folder, once known
  n: { moved: number; bytes: number; already: number; notOwned: number; failed: number; folders: number };
  errors: { id: string; name: string; detail: string }[];
};

export type TransferResult = {
  done: boolean;
  from: string;
  to: string;
  moved_so_far: number;
  folders_moved_so_far: number;
  space_freed_so_far: string;
  already_in_receiving_account: number;
  skipped_owned_by_someone_else: number;
  failed: number;
  moved_this_step: string[];
  errors: { id: string; name: string; detail: string }[];
  continue_token?: string;
  note: string;
};

/**
 * Moves `ids` from `from` to `to`, or carries on the job in `cursor` (which remembers both accounts).
 * `accounts` are all the linked accounts, used to resolve a cursor's sender and receiver.
 */
export async function transfer(
  accounts: Account[],
  opts: { ids?: string[]; from?: Account; to?: Account; cursor?: string; budgetMs: number }
): Promise<TransferResult> {
  let state: TransferState;
  if (opts.cursor) {
    state = unpackCursor<TransferState>(opts.cursor, "transfer");
  } else {
    if (!opts.from || !opts.to) throw new Error("Say which account the files move from and which receives them.");
    if (opts.from.e === opts.to.e) throw new Error("The sending and receiving accounts are the same. Pick two different accounts.");
    const ids = [...new Set((opts.ids || []).map((s) => s.trim()).filter(Boolean))];
    if (!ids.length) throw new Error("Give at least one file or folder ID (find them with find_files).");
    ids.forEach(requireId);
    state = {
      k: "transfer",
      f: opts.from.e,
      t: opts.to.e,
      todo: ids.map((id) => ({ id, root: true })),
      queue: [],
      cur: null,
      inbox: null,
      n: { moved: 0, bytes: 0, already: 0, notOwned: 0, failed: 0, folders: 0 },
      errors: [],
    };
  }
  const sender = accounts.find((x) => x.e === state.f);
  const receiver = accounts.find((x) => x.e === state.t);
  if (!sender || !receiver) {
    throw new Error("That continue_token is for accounts that aren't linked any more. Start the transfer again.");
  }
  const start = Date.now();
  const timeLeft = () => Date.now() - start < opts.budgetMs;
  const movedNow: string[] = [];

  let inboxPromise: Promise<string> | null = state.inbox ? Promise.resolve(state.inbox) : null;
  const inbox = () => {
    if (!inboxPromise) {
      inboxPromise = transferFolderId(receiver, `Transferred from ${sender.e}`).then((id) => (state.inbox = id));
      inboxPromise.catch(() => (inboxPromise = null));
    }
    return inboxPromise;
  };

  const fail = (f: { id: string; name?: string }, e: unknown) => {
    state.n.failed++;
    if (state.errors.length < 25) state.errors.push({ id: f.id, name: f.name || f.id, detail: errMsg(e) });
  };

  /** Moves one item. Folders also get their contents queued. */
  const move = async (f: DriveFile, root: boolean) => {
    const isFolder = f.mimeType === FOLDER_MIME;
    let loose = false; // only for folders we don't move: will the receiver be unable to see it?
    try {
      const owner = ownerOf(f);
      if (owner === receiver.e) {
        state.n.already++;
      } else if (!f.ownedByMe) {
        state.n.notOwned++;
        if (isFolder) loose = !(await canSee(receiver, f.id));
      } else {
        await handOver(sender, receiver, f);
        try {
          await settle(receiver, f, root, inbox, sender.e);
        } catch (e) {
          // Ownership has moved, so it counts as moved; just say what's off.
          if (state.errors.length < 25) state.errors.push({ id: f.id, name: f.name, detail: `Moved, but couldn't tag or file it: ${errMsg(e)}` });
        }
        if (isFolder) state.n.folders++;
        else {
          state.n.moved++;
          state.n.bytes += sizeOf(f);
        }
        if (movedNow.length < 15) movedNow.push(isFolder ? `${f.name}/` : f.name);
      }
    } catch (e) {
      fail(f, e);
      return;
    }
    // Its contents are moved too, whoever owned the folder (the sender may own files inside someone else's folder).
    if (isFolder) state.queue.push({ id: f.id, loose });
  };

  while (timeLeft()) {
    if (state.todo.length) {
      const batch = state.todo.splice(0, CONCURRENCY * 2);
      await pool(batch, async (w) => {
        let f: DriveFile;
        try {
          f = await drive<DriveFile>(sender, "GET", `files/${w.id}`, { fields: FILE_FIELDS });
        } catch (e) {
          fail({ id: w.id }, e instanceof DriveError && e.status === 404 ? new Error(`${sender.e} can't see this item.`) : e);
          return;
        }
        await move(f, w.root);
      });
      continue;
    }
    if (!state.cur) {
      const folder = state.queue.shift();
      if (!folder) break; // nothing left: done
      state.cur = { ...folder, pt: null };
    }
    let res: { files?: DriveFile[]; nextPageToken?: string };
    try {
      res = await drive(sender, "GET", "files", {
        q: `'${state.cur.id}' in parents and trashed = false`,
        pageSize: 50,
        pageToken: state.cur.pt || undefined,
        fields: `nextPageToken,files(${FILE_FIELDS})`,
      });
    } catch (e) {
      fail({ id: state.cur.id, name: `(contents of folder ${state.cur.id})` }, e);
      state.cur = null;
      continue;
    }
    const loose = state.cur.loose;
    state.cur.pt = res.nextPageToken || null;
    if (!state.cur.pt) state.cur = null;
    const children = res.files || [];
    // Move the page in chunks; whatever doesn't fit in the time left is picked up next step by ID.
    for (let i = 0; i < children.length; i += CONCURRENCY * 2) {
      if (!timeLeft()) {
        state.todo.push(...children.slice(i).map((f) => ({ id: f.id, root: loose })));
        break;
      }
      await pool(children.slice(i, i + CONCURRENCY * 2), (f) => move(f, loose));
    }
  }

  const done = !state.todo.length && !state.queue.length && !state.cur;
  const result: TransferResult = {
    done,
    from: sender.e,
    to: receiver.e,
    moved_so_far: state.n.moved,
    folders_moved_so_far: state.n.folders,
    space_freed_so_far: human(state.n.bytes),
    already_in_receiving_account: state.n.already,
    skipped_owned_by_someone_else: state.n.notOwned,
    failed: state.n.failed,
    moved_this_step: movedNow,
    errors: state.errors,
    note: done
      ? `Finished. Items whose old folder ${receiver.e} can't see are in "Transferred from ${sender.e}" in its My Drive. ` +
        `Google can take a few hours to update storage figures. ${sender.e} keeps edit access to what it sent.`
      : "Not finished yet: call transfer_files again with only continue_token to carry on.",
  };
  if (!done) result.continue_token = packCursor(state);
  return result;
}

/** Sender asks the receiver to become owner; receiver accepts straight away. */
async function handOver(sender: Account, receiver: Account, f: DriveFile) {
  const existing = (f.permissions || []).find((p) => (p.emailAddress || "").toLowerCase() === receiver.e);
  let permId = existing?.id;
  if (existing && !existing.pendingOwner) {
    // Already shared with the receiver: upgrade to a pending ownership request.
    await drive(sender, "PATCH", `files/${f.id}/permissions/${existing.id}`, { fields: "id" }, { role: "writer", pendingOwner: true });
  } else if (!existing) {
    const p = await drive<{ id: string }>(
      sender,
      "POST",
      `files/${f.id}/permissions`,
      { sendNotificationEmail: false, fields: "id" },
      { type: "user", role: "writer", emailAddress: receiver.e, pendingOwner: true }
    );
    permId = p.id;
  }
  await drive(receiver, "PATCH", `files/${f.id}/permissions/${permId}`, { transferOwnership: true, fields: "id" }, { role: "owner" });
}

/**
 * After the receiver accepts: tag the item with where it came from, and for picked items whose old folder the
 * receiver can't see, file it into "Transferred from <sender>" (created only if it doesn't exist). One PATCH does both.
 * Items inside a folder that came over too stay where they are, keeping the structure.
 */
async function settle(receiver: Account, f: DriveFile, root: boolean, inbox: () => Promise<string>, from: string) {
  const tag = { appProperties: { offloadedFrom: from, offloadedAt: new Date().toISOString() } };
  const parents = f.parents || [];
  const fileIt = root && !(parents.length && (await canSee(receiver, parents[0])));
  if (!fileIt) {
    await drive(receiver, "PATCH", `files/${f.id}`, { fields: "id" }, tag);
    return;
  }
  const folderId = await inbox();
  try {
    await drive(receiver, "PATCH", `files/${f.id}`, { addParents: folderId, removeParents: parents.join(",") || undefined, fields: "id" }, tag);
  } catch {
    // Some old parents can't be removed by the receiver; adding the new one is enough to make it findable.
    await drive(receiver, "PATCH", `files/${f.id}`, { addParents: folderId, fields: "id" }, tag);
  }
}

async function canSee(acct: Account, id: string): Promise<boolean> {
  try {
    await drive(acct, "GET", `files/${id}`, { fields: "id,trashed" });
    return true;
  } catch (e) {
    if (e instanceof DriveError && (e.status === 404 || e.status === 403)) return false;
    throw e;
  }
}

async function transferFolderId(acct: Account, name: string): Promise<string> {
  const res = await drive(acct, "GET", "files", {
    q: `name = '${qEsc(name)}' and mimeType = '${FOLDER_MIME}' and 'root' in parents and 'me' in owners and trashed = false`,
    pageSize: 1,
    fields: "files(id)",
  });
  if (res.files?.length) return res.files[0].id;
  const created = await drive<{ id: string }>(acct, "POST", "files", { fields: "id" }, { name, mimeType: FOLDER_MIME, parents: ["root"] });
  return created.id;
}
