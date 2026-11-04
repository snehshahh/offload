import { drive, DriveError, type Account } from "./api";

/**
 * Offload's Drive engine. It runs in the browser for the web app (/app) and on
 * the server for the Claude connector, and touches nothing but the Drive API.
 *
 * Every linked account (2 to 5) is signed in, so a transfer is requested by the sending account and accepted by
 * the receiving one in the same step: files move without anyone opening the other account.
 * Accepted items whose old folder the receiver can't see are filed into
 * "Transferred from <sender>" in the receiver's My Drive, exactly as the web app does.
 *
 * Every item the person picked (a folder, or a file on its own) is tagged with private appProperties
 * (offloadedFrom, offloadedAt), so Offload remembers on the item itself which account it came from and when.
 * Files inside a moved folder aren't tagged one by one: that would double the receiving account's work per file,
 * and their folder carries the label. Only this OAuth client can see the tags.
 */

export const FOLDER_MIME = "application/vnd.google-apps.folder";
const FILE_FIELDS =
  "id,name,mimeType,ownedByMe,parents,quotaBytesUsed,size,owners(emailAddress),permissions(id,emailAddress,role,pendingOwner)";
const LIST_FIELDS =
  "nextPageToken,files(id,name,mimeType,size,quotaBytesUsed,modifiedTime,webViewLink,thumbnailLink,appProperties,owners(emailAddress),permissions(emailAddress,pendingOwner))";
const ID_RE = /^(root|[A-Za-z0-9_-]{5,})$/;
const CONCURRENCY = 5;
/** Items handed over at the same time in a transfer. Google slows an account down if it changes much faster. */
const TRANSFER_PARALLEL = 8;

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
  thumbnailLink?: string;
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

/** "1 file", "3 files". */
export function count(n: number, one: string, many = one + "s"): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** "a, b and c" */
export function listing(parts: string[]): string {
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const KIND_NOUN: Record<FindOpts["kind"], [string, string]> = {
  all: ["file", "files"],
  images: ["image", "images"],
  videos: ["video", "videos"],
  media: ["photo or video", "photos and videos"],
  documents: ["Google file", "Google files"],
  folders: ["folder", "folders"],
};

/** "3 videos over 100 MB matching "wedding"" */
export function describeFind(o: Pick<FindOpts, "kind" | "min_size_mb" | "name_contains" | "folder_id" | "moved_from">, n: number) {
  const [one, many] = KIND_NOUN[o.kind];
  let d = count(n, one, many);
  if (o.min_size_mb) d += ` over ${o.min_size_mb.toLocaleString("en-US")} MB`;
  if (o.name_contains) d += ` matching "${o.name_contains}"`;
  if (o.folder_id) d += " in that folder";
  if (o.moved_from?.length) d += " that Offload moved here";
  return d;
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
  let message: string;
  if (!items.length) message = `No ${describeFind(o, 2).replace(/^2 /, "")} in ${acct.e}.`;
  else {
    message = `${describeFind(o, items.length)} in ${acct.e}`;
    if (o.kind !== "folders") message += `, ${human(total)} in total`;
    const top = items[0];
    if (items.length > 1 && o.kind !== "folders" && sort === "largest") message += `. Biggest: ${top.name} (${top.size})`;
    message += next ? `. These are the first ${items.length}; there are more.` : ".";
  }
  return {
    account: acct.e,
    message,
    count: items.length,
    total_size: human(total),
    items,
    next_page_token: next || null,
  };
}

export type Item = ReturnType<typeof slim>;

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
    ...(f.thumbnailLink ? { thumb: f.thumbnailLink } : {}),
    ...(pending ? { pending_transfer_to: pending.emailAddress || "" } : {}),
    ...(f.appProperties?.offloadedFrom
      ? { moved_here_from: f.appProperties.offloadedFrom, moved_on: f.appProperties.offloadedAt || "" }
      : {}),
  };
}

/* ===================================================================== *
 * Folder size
 * ===================================================================== */

export type SizeState = { k: "size"; queue: string[]; token: string | null; bytes: number; files: number; notOwned: number };

/**
 * Space the files you own inside a folder (all subfolders included) take up: what a transfer would free.
 * Works for up to `budgetMs`; if it isn't done, call again with the returned state.
 */
export async function folderSize(acct: Account, folderId: string, prev?: SizeState, budgetMs = 30_000) {
  let state: SizeState;
  if (prev) state = prev;
  else {
    requireId(folderId);
    state = { k: "size", queue: [folderId], token: null, bytes: 0, files: 0, notOwned: 0 };
  }
  const start = Date.now();
  while (state.queue.length && Date.now() - start < budgetMs) {
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
  const others = state.notOwned
    ? ` ${count(state.notOwned, "file")} in it belong${state.notOwned === 1 ? "s" : ""} to someone else and would stay put.`
    : "";
  const message = done
    ? `Moving this folder would free about ${human(state.bytes)} in ${acct.e} (${count(state.files, "file")} it owns).${others}`
    : `Still adding up: ${human(state.bytes)} in ${count(state.files, "file")} so far. Carrying on…`;
  return {
    message,
    folder_id: folderId,
    size: human(state.bytes),
    size_bytes: state.bytes,
    files_you_own: state.files,
    files_owned_by_others: state.notOwned,
    done,
    ...(done ? {} : { state }),
  };
}

/* ===================================================================== *
 * Transfer: request with the sender, accept with the receiver
 * ===================================================================== */

type Work = { id: string; root: boolean };

export type TransferState = {
  k: "transfer";
  f: string; // sender email
  t: string; // receiver email
  todo: Work[]; // items to fetch and move
  // Folders whose contents still have to be listed. loose: the receiver won't be able to see this folder,
  // so whatever comes out of it has to be filed into "Transferred from <sender>".
  queue: { id: string; loose: boolean }[];
  cur: { id: string; pt: string | null; loose: boolean } | null;
  inbox: string | null; // receiver's "Transferred from <sender>" folder, once known
  u0?: number; // sender's storage use (bytes) when the job started, for the "should drop to" estimate
  lim?: number | null; // sender's storage limit
  n: { moved: number; bytes: number; already: number; notOwned: number; failed: number; folders: number };
  errors: { id: string; name: string; detail: string }[];
};

export type TransferResult = {
  message: string;
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
  /** Present while not done: pass it back to carry on. */
  state?: TransferState;
};

/**
 * Moves `ids` from `from` to `to` for up to `budgetMs`, or carries on the job in `state` (which remembers both
 * accounts). `accounts` are all the linked accounts, used to resolve a saved job's sender and receiver.
 */
export async function transfer(
  accounts: Account[],
  opts: {
    ids?: string[];
    from?: Account;
    to?: Account;
    state?: TransferState;
    budgetMs: number;
    /** Called with a progress snapshot as items move (at most a few times a second). */
    onProgress?: (r: TransferResult) => void;
  }
): Promise<TransferResult> {
  let state: TransferState;
  if (opts.state) {
    state = opts.state;
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
    try {
      const q = (await drive(opts.from, "GET", "about", { fields: "storageQuota" })).storageQuota || {};
      state.u0 = Number(q.usage) || 0;
      state.lim = q.limit ? Number(q.limit) : null;
    } catch {
      /* the estimate is a nicety; the move doesn't need it */
    }
  }
  const sender = accounts.find((x) => x.e === state.f);
  const receiver = accounts.find((x) => x.e === state.t);
  if (!sender || !receiver) {
    throw new Error("This transfer is for accounts that aren't linked any more. Start it again.");
  }
  const start = Date.now();
  const timeLeft = () => Date.now() - start < opts.budgetMs;
  const movedNow: string[] = [];
  let lastReport = 0;

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
          // Only picked items (and loose ones) need filing and a label; files inside a moved folder stay put.
          if (root) await settle(receiver, f, root, inbox, sender.e);
        } catch (e) {
          // Ownership has moved, so it counts as moved; just say what's off.
          if (state.errors.length < 25) state.errors.push({ id: f.id, name: f.name, detail: `Moved, but couldn't tag or file it: ${errMsg(e)}` });
        }
        if (isFolder) state.n.folders++;
        else {
          state.n.moved++;
          state.n.bytes += sizeOf(f);
        }
        if (movedNow.length >= 15) movedNow.shift();
        movedNow.push(isFolder ? `${f.name}/` : f.name);
        if (opts.onProgress && Date.now() - lastReport > 300) {
          lastReport = Date.now();
          opts.onProgress(snapshot(false));
        }
      }
    } catch (e) {
      fail(f, e);
      return;
    }
    // Its contents are moved too, whoever owned the folder (the sender may own files inside someone else's folder).
    if (isFolder) state.queue.push({ id: f.id, loose });
  };

  // Listed folder contents waiting to be moved, with whether they need filing (see TransferState.queue).
  const listed: { f: DriveFile; root: boolean }[] = [];
  let listing: Promise<void> | null = null;
  let active = 0;

  /** Reads the next page of the folder being emptied (or starts the next folder). */
  const listNext = async () => {
    if (!state.cur) {
      const folder = state.queue.shift();
      if (!folder) return;
      state.cur = { ...folder, pt: null };
    }
    const cur = state.cur;
    try {
      const res: { files?: DriveFile[]; nextPageToken?: string } = await drive(sender, "GET", "files", {
        q: `'${cur.id}' in parents and trashed = false`,
        pageSize: 100,
        pageToken: cur.pt || undefined,
        fields: `nextPageToken,files(${FILE_FIELDS})`,
      });
      for (const f of res.files || []) listed.push({ f, root: cur.loose });
      cur.pt = res.nextPageToken || null;
      if (!cur.pt) state.cur = null;
    } catch (e) {
      fail({ id: cur.id, name: `(contents of folder ${cur.id})` }, e);
      state.cur = null;
    }
  };

  // Workers pull from one queue: the next item starts as soon as any finishes, and one worker reads the next page
  // of a folder while the others keep moving files.
  const worker = async () => {
    while (timeLeft()) {
      const next = listed.shift();
      if (next) {
        active++;
        try {
          await move(next.f, next.root);
        } finally {
          active--;
        }
        continue;
      }
      const w = state.todo.shift();
      if (w) {
        active++;
        try {
          const f = await drive<DriveFile>(sender, "GET", `files/${w.id}`, { fields: FILE_FIELDS });
          await move(f, w.root);
        } catch (e) {
          fail({ id: w.id }, e instanceof DriveError && e.status === 404 ? new Error(`${sender.e} can't see this item.`) : e);
        } finally {
          active--;
        }
        continue;
      }
      if (state.cur || state.queue.length) {
        if (!listing) listing = listNext().finally(() => (listing = null));
        await listing;
        continue;
      }
      if (listing) {
        await listing;
        continue;
      }
      if (active > 0) {
        // Someone is still moving a folder, which may queue its contents: wait a moment.
        await new Promise((z) => setTimeout(z, 25));
        continue;
      }
      return; // nothing left
    }
  };
  await Promise.all(Array.from({ length: TRANSFER_PARALLEL }, worker));
  // Listed but not reached before the time ran out: picked up next step by ID.
  state.todo.push(...listed.splice(0).map((x) => ({ id: x.f.id, root: x.root })));

  const done = !state.todo.length && !state.queue.length && !state.cur;
  const result = snapshot(done);
  if (!done) result.state = state;
  return result;

  function snapshot(done: boolean): TransferResult {
    return {
    message: transferMessage(state, sender!.e, receiver!.e, done),
    done,
    from: sender!.e,
    to: receiver!.e,
    moved_so_far: state.n.moved,
    folders_moved_so_far: state.n.folders,
    space_freed_so_far: human(state.n.bytes),
    already_in_receiving_account: state.n.already,
    skipped_owned_by_someone_else: state.n.notOwned,
    failed: state.n.failed,
    moved_this_step: [...movedNow],
    errors: [...state.errors],
    note: done
      ? `Finished. Items whose old folder ${receiver!.e} can't see are in "Transferred from ${sender!.e}" in its My Drive. ` +
        `Google can take a few hours to update storage figures. ${sender!.e} keeps edit access to what it sent.`
      : "Not finished yet: call transfer_files again with only continue_token to carry on.",
    };
  }
}

/** The sentence Claude can pass on as is: what moved, what didn't, and what happens next. */
function transferMessage(state: TransferState, from: string, to: string, done: boolean): string {
  const n = state.n;
  const what = listing([
    ...(n.moved || !n.folders ? [count(n.moved, "file")] : []),
    ...(n.folders ? [count(n.folders, "folder")] : []),
  ]);
  if (!done) {
    return `Still moving from ${from} to ${to}: ${what} so far (${human(n.bytes)}). Carrying on…`;
  }
  const parts: string[] = [];
  parts.push(
    n.moved || n.folders
      ? `Moved ${what} (${human(n.bytes)}) from ${from} to ${to}.`
      : `Nothing needed moving from ${from} to ${to}.`
  );
  if (n.already) parts.push(`${count(n.already, "item was", "items were")} already in ${to}.`);
  if (n.notOwned) parts.push(`Skipped ${count(n.notOwned, "item")} that belong${n.notOwned === 1 ? "s" : ""} to someone else.`);
  if (n.failed) parts.push(`${count(n.failed, "item")} couldn't be moved: see errors.`);
  if (state.inbox) parts.push(`Loose items are in "Transferred from ${from}" in ${to}'s My Drive.`);
  if (n.bytes && state.u0) {
    const after = Math.max(0, state.u0 - n.bytes);
    const of = state.lim ? ` of ${human(state.lim)}` : "";
    parts.push(
      human(after) === human(state.u0)
        ? `That frees about ${human(n.bytes)} in ${from} once Google updates its numbers, usually within a few hours.`
        : `${from} was at ${human(state.u0)}${of}; it should drop to about ${human(after)} once Google updates its numbers, usually within a few hours.`
    );
  }
  return parts.join(" ");
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

/* ===================================================================== *
 * Browsing, and transfers waiting to be accepted (web app)
 * ===================================================================== */

export type FolderEntry = { id: string; name: string; owned: boolean; owner: string };

/** The folders directly inside `parentId` ("root" = My Drive), A to Z, whoever owns them. */
export async function listFolders(acct: Account, parentId: string): Promise<FolderEntry[]> {
  requireId(parentId);
  const out: FolderEntry[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive(acct, "GET", "files", {
      q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      orderBy: "name",
      pageSize: 200,
      pageToken,
      fields: "nextPageToken,files(id,name,ownedByMe,owners(emailAddress))",
    });
    for (const f of (res.files || []) as DriveFile[]) out.push({ id: f.id, name: f.name, owned: !!f.ownedByMe, owner: ownerOf(f) });
    pageToken = res.nextPageToken;
  } while (pageToken && out.length < 2000);
  return out;
}

export type PendingItem = Item & { from: string };

/**
 * Items someone has asked `acct` to take ownership of, but that it hasn't accepted yet (for example, sent from
 * Drive itself or by someone else). Scans what the account can see but doesn't own, newest first.
 */
export async function listPending(acct: Account, pageToken?: string, budgetMs = 15_000) {
  const items: PendingItem[] = [];
  const start = Date.now();
  let next: string | undefined = pageToken;
  let scanned = 0;
  do {
    const res = await drive(acct, "GET", "files", {
      q: "not 'me' in owners and trashed = false",
      orderBy: "modifiedTime desc",
      pageSize: 200,
      pageToken: next,
      fields: LIST_FIELDS,
    });
    for (const f of (res.files || []) as DriveFile[]) {
      scanned++;
      const mine = (f.permissions || []).some((p) => (p.emailAddress || "").toLowerCase() === acct.e && p.pendingOwner);
      if (mine) items.push({ ...slim(f), from: ownerOf(f) });
    }
    next = res.nextPageToken;
  } while (next && items.length < 100 && Date.now() - start < budgetMs);
  return { account: acct.e, items, scanned, next_page_token: next || null };
}

export type AcceptResult = { message: string; done: boolean; accepted: number; bytes: number; failed: number; errors: { id: string; name: string; detail: string }[]; remaining: string[] };

/**
 * Accepts pending transfers to `receiver`, for up to `budgetMs`. Loose items go into "Transferred from <sender>",
 * like moved items; items inside a folder that came over too stay where they are.
 */
export async function acceptPending(receiver: Account, ids: string[], budgetMs = 30_000, prev?: AcceptResult): Promise<AcceptResult> {
  const out: AcceptResult = prev
    ? { ...prev, remaining: [...prev.remaining], errors: [...prev.errors] }
    : { message: "", done: false, accepted: 0, bytes: 0, failed: 0, errors: [], remaining: [...new Set(ids)] };
  const inboxes = new Map<string, Promise<string>>();
  const inboxFor = (sender: string) => () => {
    if (!inboxes.has(sender)) inboxes.set(sender, transferFolderId(receiver, `Transferred from ${sender}`));
    return inboxes.get(sender)!;
  };
  const start = Date.now();
  while (out.remaining.length && Date.now() - start < budgetMs) {
    const batch = out.remaining.splice(0, CONCURRENCY * 2);
    await pool(batch, async (id) => {
      let f: DriveFile | null = null;
      try {
        requireId(id);
        f = await drive<DriveFile>(receiver, "GET", `files/${id}`, { fields: FILE_FIELDS });
        let perms = f.permissions;
        if (!perms) {
          const p = await drive(receiver, "GET", `files/${id}/permissions`, { fields: "permissions(id,emailAddress,role,pendingOwner)" });
          perms = p.permissions || [];
        }
        const mine = (perms || []).find((p) => (p.emailAddress || "").toLowerCase() === receiver.e && p.pendingOwner);
        if (f.ownedByMe) return; // already accepted
        if (!mine?.id) throw new Error("Nothing is waiting for this account on that item any more.");
        const sender = ownerOf(f);
        await drive(receiver, "PATCH", `files/${id}/permissions/${mine.id}`, { transferOwnership: true, fields: "id" }, { role: "owner" });
        out.accepted++;
        out.bytes += sizeOf(f);
        try {
          await settle(receiver, f, true, inboxFor(sender), sender);
        } catch {
          /* accepted; filing it is a nicety */
        }
      } catch (e) {
        out.failed++;
        if (out.errors.length < 25) out.errors.push({ id, name: f?.name || id, detail: errMsg(e) });
      }
    });
  }
  out.done = !out.remaining.length;
  out.message = out.done
    ? `Accepted ${count(out.accepted, "item")} (${human(out.bytes)}) into ${receiver.e}.` +
      (out.failed ? ` ${count(out.failed, "item")} couldn't be accepted: see errors.` : "")
    : `Still accepting into ${receiver.e}: ${count(out.accepted, "item")} so far (${human(out.bytes)}). Carrying on…`;
  return out;
}
