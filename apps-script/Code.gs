/**
 * Drive Ownership Transfer — Apps Script web app
 * Deploy as: Execute as "User accessing the web app", Who has access "Anyone with a Google account".
 * Requires the Drive advanced service (v3) — see appsscript.json.
 *
 * Sections:
 *   Folders           — transfer whole folders (folder, subfolders, files). Job loop: startSend/startScan/startAccept + runBatch.
 *   Large files       — list owned files above a size, pick, transfer.        listMyFiles + transferFiles
 *   Photos and videos — list owned images/videos, pick, transfer.              listMyFiles + transferFiles
 *   Waiting for you   — receiver lists everything pending for them, accepts.   listInbox + acceptFiles
 *
 * Accepted items that would otherwise be loose (their old folder isn't visible to the receiver)
 * are filed into "Transferred from <sender email>" in the receiver's My Drive — created only if it doesn't exist.
 */

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const TIME_BUDGET_MS = 4.5 * 60 * 1000;     // stay under the 6-minute limit per call
const LIST_BUDGET_MS = 20 * 1000;           // keep list calls snappy
const FILE_FIELDS = 'id,name,mimeType,ownedByMe,parents,owners(emailAddress),permissions(id,emailAddress,role,pendingOwner)';
const LIST_FIELDS = 'nextPageToken,files(id,name,mimeType,size,quotaBytesUsed,thumbnailLink,createdTime,ownedByMe,owners(emailAddress),permissions(id,emailAddress,pendingOwner))';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ID_RE = /^[A-Za-z0-9_-]+$/;

// Optional: full URL of a PNG favicon (e.g. https://your-site/favicon-32.png once the landing page is live).
const FAVICON_URL = '';

function transferFolderName_(owner) {
  return 'Transferred from ' + owner;
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const t = HtmlService.createTemplateFromFile('Index');
  t.mode = params.accept ? 'accept' : (params.inbox ? 'inbox' : 'send');
  t.acceptFolders = params.accept || '';
  t.appUrl = ScriptApp.getService().getUrl();
  const out = t.evaluate()
    .setTitle('Offload: move Drive files to your other Google account')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  if (FAVICON_URL) out.setFaviconUrl(FAVICON_URL);
  return out;
}

function getMe() {
  return Session.getActiveUser().getEmail();
}

/** Storage quota of the signed-in account (bytes). limit is null for unlimited plans. */
function getStorage() {
  const q = Drive.About.get({ fields: 'storageQuota' }).storageQuota || {};
  const num = v => (v === undefined || v === null || v === '') ? null : Number(v);
  return {
    limit: num(q.limit),
    usage: num(q.usage) || 0,
    drive: num(q.usageInDrive) || 0,
    trash: num(q.usageInDriveTrash) || 0
  };
}

/** Child folders of a folder ('root' = My Drive), for the folder picker. */
function listFolders(parentId) {
  requireId_(parentId);
  const out = [];
  let pageToken;
  do {
    const res = Drive.Files.list({
      q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      pageSize: 200,
      pageToken,
      orderBy: 'name',
      fields: 'nextPageToken,files(id,name,ownedByMe)'
    });
    (res.files || []).forEach(f => out.push({ id: f.id, name: f.name, ownedByMe: f.ownedByMe }));
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

/**
 * Size of the files I own inside a folder (all subfolders included) — the space a transfer would free.
 * Works in slices of ~15s: pass back the returned state until done = true.
 * Returns { bytes, files, done, state }.
 */
function folderSize(id, state) {
  requireId_(id);
  state = state || { queue: [id], token: null, bytes: 0, files: 0 };
  const start = Date.now();
  while (state.queue.length && Date.now() - start < 15000) {
    const fid = state.queue[0];
    const res = Drive.Files.list({
      q: `'${fid}' in parents and trashed = false`,
      pageSize: 1000,
      pageToken: state.token || undefined,
      fields: 'nextPageToken,files(id,mimeType,ownedByMe,quotaBytesUsed,size)'
    });
    for (const f of res.files || []) {
      if (f.mimeType === FOLDER_MIME) state.queue.push(f.id);
      else if (f.ownedByMe) { state.bytes += sizeOf_(f); state.files++; }
    }
    if (res.nextPageToken) state.token = res.nextPageToken;
    else { state.queue.shift(); state.token = null; }
  }
  const done = !state.queue.length;
  return { bytes: state.bytes, files: state.files, done: done, state: done ? null : state };
}

/* =====================================================================
 * Large files / Photos and videos (sender side)
 * ===================================================================== */

/**
 * opts: { kind: 'large'|'media', minMB, media: 'all'|'image'|'video', sort: 'size'|'newest', query, pageToken }
 * Returns { items, nextPageToken }.
 */
function listMyFiles(opts) {
  opts = opts || {};
  const minBytes = Math.max(0, Number(opts.minMB) || 0) * 1024 * 1024;
  let q = `'me' in owners and trashed = false and mimeType != '${FOLDER_MIME}'`;
  if (opts.kind === 'media') {
    if (opts.media === 'image') q += " and mimeType contains 'image/'";
    else if (opts.media === 'video') q += " and mimeType contains 'video/'";
    else q += " and (mimeType contains 'image/' or mimeType contains 'video/')";
  }
  if (opts.query) q += " and name contains '" + qEsc_(opts.query) + "'";
  const bySize = opts.sort !== 'newest';
  const orderBy = bySize ? 'quotaBytesUsed desc' : 'createdTime desc';

  const out = [];
  const start = Date.now();
  let pageToken = opts.pageToken || undefined;
  let next = null;
  do {
    const res = Drive.Files.list({ q, orderBy, pageSize: 100, pageToken, fields: LIST_FIELDS });
    let reachedSmall = false;
    for (const f of res.files || []) {
      if (minBytes && sizeOf_(f) < minBytes) {
        if (bySize) { reachedSmall = true; break; } // sorted biggest-first: everything after is smaller
        continue;
      }
      out.push(slim_(f));
    }
    next = reachedSmall ? null : (res.nextPageToken || null);
    pageToken = next;
  } while (pageToken && out.length < 100 && Date.now() - start < LIST_BUDGET_MS);
  return { items: out, nextPageToken: next };
}

/** Request ownership transfer for specific files. Returns { results, remaining } — call again with remaining. */
function transferFiles(ids, recipient, notify) {
  recipient = validateRecipient_(recipient);
  return processIds_(ids, (id, state) => {
    const f = Drive.Files.get(id, { fields: FILE_FIELDS });
    requestTransfer_(state, f);
  }, { job: 'send', recipient: recipient, notify: !!notify });
}

/* =====================================================================
 * Waiting for you (receiver side)
 * ===================================================================== */

/**
 * Everything I can see but don't own that has a pending ownership request for me.
 * (Not limited to "shared with me": files inside folders I already own count too.)
 * opts: { query, from, pageToken }. Returns { items, nextPageToken, scanned }.
 */
function listInbox(opts) {
  opts = opts || {};
  const me = getMe().toLowerCase();
  let q = "not 'me' in owners and trashed = false";
  if (opts.query) q += " and name contains '" + qEsc_(opts.query) + "'";
  const from = String(opts.from || '').trim().toLowerCase();
  if (EMAIL_RE.test(from)) q += " and '" + qEsc_(from) + "' in owners";

  const out = [];
  const start = Date.now();
  let pageToken = opts.pageToken || undefined;
  let next = null;
  let scanned = 0;
  do {
    const res = Drive.Files.list({ q, pageSize: 200, pageToken, fields: LIST_FIELDS });
    for (const f of res.files || []) {
      scanned++;
      if (f.ownedByMe) continue;
      let pending = null;
      try { pending = myPending_(f, me); } catch (e) { pending = null; }
      if (pending) out.push(slim_(f));
    }
    next = res.nextPageToken || null;
    pageToken = next;
  } while (pageToken && out.length < 100 && Date.now() - start < LIST_BUDGET_MS);
  return { items: out, nextPageToken: next, scanned: scanned };
}

/** Accept specific pending items. Loose ones go into "Transferred from <sender>". Returns { results, remaining }. */
function acceptFiles(ids) {
  const me = getMe().toLowerCase();
  const folderCache = {};
  return processIds_(ids, (id, state) => {
    const f = Drive.Files.get(id, { fields: FILE_FIELDS });
    acceptTransfer_(state, f, me, true, folderCache);
  }, { job: 'accept' });
}

/* =====================================================================
 * Folders section — job loop
 * ===================================================================== */

/** notify = true emails the recipient about each item (Google sends one email per file). Off by default. */
function startSend(rootIds, recipient, notify) {
  recipient = validateRecipient_(recipient);
  requireRoots_(rootIds);
  const state = newState_('send', 'send', rootIds, recipient);
  state.notify = !!notify;
  return state;
}

function startAccept(rootIds) {
  requireRoots_(rootIds);
  return newState_('accept', 'accept', rootIds, null);
}

/** Read-only status check. view = 'send' (sender's side) or 'accept' (receiver's side). */
function startScan(rootIds, view, recipient) {
  requireRoots_(rootIds);
  recipient = String(recipient || '').trim().toLowerCase();
  return newState_('scan', view === 'accept' ? 'accept' : 'send', rootIds, EMAIL_RE.test(recipient) ? recipient : null);
}

/** Process as much as fits in the time budget, then hand the state back to the browser. */
function runBatch(state) {
  const start = Date.now();
  const me = getMe().toLowerCase();
  state.items = [];
  state.folderCache = state.folderCache || {};

  while (true) {
    if (!state.current) {
      if (!state.queue.length) { state.done = true; return state; }
      const id = state.queue.shift();
      if (state.seen[id]) continue;
      state.seen[id] = true;
      state.current = { id: id, pageToken: null };
      state.foldersScanned++;
      let folder;
      try {
        folder = Drive.Files.get(id, { fields: FILE_FIELDS });
      } catch (e) {
        addItem_(state, { id: id, name: '(folder ' + id + ')', mimeType: FOLDER_MIME }, 'error', errMsg_(e));
        state.current = null;
        continue;
      }
      handleItem_(state, folder, me, state.roots.indexOf(id) !== -1); // the folder itself is transferred too
    }

    if (Date.now() - start > TIME_BUDGET_MS) return state;

    let res;
    try {
      res = Drive.Files.list({
        q: `'${state.current.id}' in parents and trashed = false`,
        pageSize: 100,
        pageToken: state.current.pageToken || undefined,
        fields: 'nextPageToken,files(' + FILE_FIELDS + ')'
      });
    } catch (e) {
      addItem_(state, { id: state.current.id, name: '(contents of folder ' + state.current.id + ')', mimeType: FOLDER_MIME }, 'error', errMsg_(e));
      state.current = null;
      continue;
    }

    for (const f of res.files || []) {
      if (f.mimeType === FOLDER_MIME) state.queue.push(f.id); // subfolder: handled (and transferred) when dequeued
      else handleItem_(state, f, me, false);
    }

    state.current.pageToken = res.nextPageToken || null;
    if (!res.nextPageToken) state.current = null;
  }
}

/* =====================================================================
 * Per-item handlers
 * ===================================================================== */

function handleItem_(state, f, me, isRoot) {
  try {
    if (state.job === 'send') requestTransfer_(state, f);
    else if (state.job === 'accept') acceptTransfer_(state, f, me, isRoot, state.folderCache);
    else scanItem_(state, f, me);
  } catch (e) {
    addItem_(state, f, 'error', errMsg_(e));
  }
}

function requestTransfer_(state, f) {
  if (!f.ownedByMe) { addItem_(state, f, 'notOwned', 'Owner: ' + ownerOf_(f)); return; }
  const p = (f.permissions || []).find(x => (x.emailAddress || '').toLowerCase() === state.recipient);
  if (p && p.pendingOwner) { addItem_(state, f, 'alreadyPending', 'Waiting for ' + state.recipient); return; }
  if (p) {
    Drive.Permissions.update({ role: 'writer', pendingOwner: true }, f.id, p.id);
  } else {
    Drive.Permissions.create(
      { type: 'user', role: 'writer', emailAddress: state.recipient, pendingOwner: true },
      f.id,
      { sendNotificationEmail: !!state.notify }
    );
  }
  addItem_(state, f, 'requested', 'To ' + state.recipient);
}

/** fileIt = true for items whose old location may be invisible to the receiver (selected files, top-level folders). */
function acceptTransfer_(state, f, me, fileIt, folderCache) {
  if (f.ownedByMe) { addItem_(state, f, 'alreadyYours', ''); return; }
  const owner = ownerOf_(f);
  const p = myPending_(f, me);
  if (!p) { addItem_(state, f, 'nothingPending', 'Owner: ' + owner); return; }
  Drive.Permissions.update({ role: 'owner' }, f.id, p.id, { transferOwnership: true });
  const where = fileIt ? fileIntoTransferFolder_(f, owner, folderCache || {}) : 'From ' + owner;
  addItem_(state, f, 'accepted', where);
}

function scanItem_(state, f, me) {
  const owner = ownerOf_(f);
  if (state.view === 'send') {
    if (f.ownedByMe) {
      const p = (f.permissions || []).find(x => x.pendingOwner);
      if (p) addItem_(state, f, 'pending', 'Waiting for ' + (p.emailAddress || 'recipient') + ' to accept');
      else addItem_(state, f, 'notRequested', 'Still owned by you');
    } else if (state.recipient && owner.toLowerCase() === state.recipient) {
      addItem_(state, f, 'transferred', 'Now owned by ' + owner);
    } else {
      addItem_(state, f, 'notOwned', 'Owner: ' + owner);
    }
  } else {
    if (f.ownedByMe) { addItem_(state, f, 'yours', ''); return; }
    if (myPending_(f, me)) addItem_(state, f, 'waiting', 'From ' + owner);
    else addItem_(state, f, 'notPending', 'Owner: ' + owner);
  }
}

/**
 * After accepting: if the item still sits in a folder the receiver can see (e.g. a folder that's coming over too),
 * leave it there. Otherwise file it into "Transferred from <owner>", creating that folder only if it doesn't exist.
 */
function fileIntoTransferFolder_(f, owner, cache) {
  const parents = f.parents || [];
  if (parents.length) {
    try {
      Drive.Files.get(parents[0], { fields: 'id' });
      return 'From ' + owner; // its folder is visible to me: keep the structure
    } catch (e) { /* old folder not visible: file it below */ }
  }
  const name = transferFolderName_(owner);
  try {
    const folderId = transferFolderId_(name, cache);
    const args = { addParents: folderId, fields: 'id' };
    if (parents.length) args.removeParents = parents.join(',');
    Drive.Files.update({}, f.id, null, args);
    return 'Saved in "' + name + '"';
  } catch (e) {
    return 'From ' + owner + '. Couldn\'t file it into "' + name + '": ' + errMsg_(e);
  }
}

function transferFolderId_(name, cache) {
  if (cache[name]) return cache[name];
  const res = Drive.Files.list({
    q: "name = '" + qEsc_(name) + "' and mimeType = '" + FOLDER_MIME + "' and 'root' in parents and 'me' in owners and trashed = false",
    pageSize: 1,
    fields: 'files(id)'
  });
  let id = res.files && res.files.length ? res.files[0].id : null;
  if (!id) id = Drive.Files.create({ name: name, mimeType: FOLDER_MIME, parents: ['root'] }, null, { fields: 'id' }).id;
  cache[name] = id;
  return id;
}

/* =====================================================================
 * Helpers
 * ===================================================================== */

function processIds_(ids, fn, base) {
  if (!Array.isArray(ids) || !ids.length) throw new Error('Select at least one item.');
  const start = Date.now();
  const rest = ids.slice();
  const results = [];
  while (rest.length && Date.now() - start < TIME_BUDGET_MS) {
    const id = String(rest.shift());
    const state = Object.assign({ items: [] }, base);
    if (!ID_RE.test(id)) { results.push({ id: id, status: 'error', detail: 'Invalid ID' }); continue; }
    try { fn(id, state); } catch (e) { state.items.push({ id: id, status: 'error', detail: errMsg_(e) }); }
    const r = state.items[0] || { status: 'error', detail: 'No result' };
    results.push({ id: id, status: r.status, detail: r.detail });
  }
  return { results: results, remaining: rest };
}

function newState_(job, view, rootIds, recipient) {
  return {
    job: job, view: view, recipient: recipient,
    roots: rootIds.slice(), queue: rootIds.slice(),
    current: null, seen: {}, foldersScanned: 0, done: false,
    items: [], folderCache: {}
  };
}

function validateRecipient_(recipient) {
  recipient = String(recipient || '').trim().toLowerCase();
  if (!EMAIL_RE.test(recipient)) throw new Error('Enter the destination Gmail address first.');
  if (recipient === getMe().toLowerCase()) throw new Error('That\'s the account you\'re signed in with. Enter the other account.');
  return recipient;
}

function requireRoots_(rootIds) {
  if (!rootIds || !rootIds.length) throw new Error('Select at least one folder.');
  rootIds.forEach(requireId_);
}

function requireId_(id) {
  if (!ID_RE.test(String(id))) throw new Error('Invalid ID: ' + id);
}

function myPending_(f, me) {
  let perms = f.permissions;
  if (!perms) {
    perms = Drive.Permissions.list(f.id, { fields: 'permissions(id,emailAddress,role,pendingOwner)' }).permissions || [];
  }
  return perms.find(x => (x.emailAddress || '').toLowerCase() === me && x.pendingOwner) || null;
}

function ownerOf_(f) {
  return ((f.owners || [])[0] || {}).emailAddress || 'unknown';
}

function sizeOf_(f) {
  return Number(f.quotaBytesUsed || f.size || 0);
}

function slim_(f) {
  const pend = (f.permissions || []).find(x => x.pendingOwner);
  return {
    id: f.id,
    name: f.name,
    mime: f.mimeType || '',
    folder: f.mimeType === FOLDER_MIME,
    size: sizeOf_(f),
    thumb: f.thumbnailLink || '',
    created: f.createdTime || '',
    owner: ownerOf_(f),
    pendingTo: pend ? (pend.emailAddress || '') : ''
  };
}

function addItem_(state, f, status, detail) {
  state.items.push({ id: f.id, name: f.name || f.id, folder: f.mimeType === FOLDER_MIME, status: status, detail: detail || '' });
}

function qEsc_(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function errMsg_(e) {
  return e && e.message ? e.message : String(e);
}
