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
 *   Google Photos     — copy picked photos into the other account's Google Photos. photosSetup, photosStartPick,
 *                       photosPoll, photosList, photosStartCopy + photosCopyBatch (see that section).
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
 * Google Photos — copy, not transfer
 *
 * Google Photos has no ownership transfer, so photos are copied: the signed-in account picks them in
 * Google's own picker (Photos Picker API), then each one is downloaded and uploaded into the other
 * account's Google Photos (Photos Library API, add-only access), in chunks, and gathered in an album.
 * The originals stay where they are; the user deletes them afterwards.
 *
 * The other account signs in once through an OAuth web client whose ID and secret live in
 * Script Properties PHOTOS_CLIENT_ID / PHOTOS_CLIENT_SECRET (see README). Its refresh token is kept in
 * the signed-in user's own User Properties.
 * ===================================================================== */

const PICKER_API = 'https://photospicker.googleapis.com/v1/';
const LIBRARY_API = 'https://photoslibrary.googleapis.com/v1/';
const DEST_SCOPES = 'openid email https://www.googleapis.com/auth/photoslibrary.appendonly';
const DEST_KEY = 'PHOTOS_DEST';
const ALBUM_KEY = 'PHOTOS_ALBUM:';
const PHOTOS_MAX_PICK = 2000;                 // the picker's own limit per session
const PHOTOS_CHUNK = 32 * 1024 * 1024;        // a multiple of 256 KB, under UrlFetch's 50 MB limit
const PHOTOS_BATCH_MS = 25 * 1000;            // short calls, so the progress bar keeps moving
const PHOTO_URL_TTL_MS = 45 * 60 * 1000;      // picked items' download links last 60 minutes

/** What the Google Photos tab needs to draw itself. hint = an email to preselect in Google's account chooser. */
function photosSetup(hint) {
  const c = photosClient_();
  const configured = !!(c.id && c.secret);
  const dest = destGet_();
  return { configured: configured, me: getMe(), dest: dest ? dest.email : null, authUrl: configured ? destAuthUrl_(hint) : '' };
}

/** Forget the other account (and revoke Offload's access to it). */
function photosDisconnect() {
  const d = destGet_();
  if (d) {
    try { UrlFetchApp.fetch('https://oauth2.googleapis.com/revoke', { method: 'post', payload: { token: d.refresh }, muteHttpExceptions: true }); } catch (e) { /* forgetting it is enough */ }
    PropertiesService.getUserProperties().deleteProperty(DEST_KEY);
  }
  return photosSetup('');
}

/** Google redirects here after the other account signs in (state token from destAuthUrl_). */
function photosAuthCallback(req) {
  const p = (req && req.parameter) || {};
  if (p.error) return authPage_(false, p.error === 'access_denied' ? 'You cancelled, so nothing was connected.' : 'Google said: ' + p.error);
  try {
    const c = photosClient_();
    const tok = postForm_('https://oauth2.googleapis.com/token', {
      code: p.code, client_id: c.id, client_secret: c.secret, redirect_uri: destRedirect_(), grant_type: 'authorization_code'
    });
    if ((tok.scope || '').indexOf('photoslibrary.appendonly') === -1) {
      return authPage_(false, 'Offload needs permission to add photos to that account. Try again and leave that box ticked.');
    }
    const email = String(jwtClaims_(tok.id_token).email || '').toLowerCase();
    if (!email) return authPage_(false, 'Couldn\'t tell which account you signed in with. Try again.');
    if (email === getMe().toLowerCase()) {
      return authPage_(false, 'That\'s ' + email + ', the account you\'re copying from. Sign in with the other one.');
    }
    if (!tok.refresh_token) return authPage_(false, 'Google didn\'t grant lasting access. Try again.');
    destSave_({ email: email, refresh: tok.refresh_token, access: tok.access_token, exp: Date.now() + (tok.expires_in || 3600) * 1000 });
    return authPage_(true, 'Photos you copy will go to ' + email + '. You can close this window and go back to Offload.');
  } catch (e) {
    return authPage_(false, errMsg_(e));
  }
}

/** Open a picker session for the signed-in account. Returns { id, uri, pollMs }. */
function photosStartPick() {
  destToken_(); // make sure there's somewhere to copy to before anything is picked
  const s = api_('post', PICKER_API + 'sessions', ScriptApp.getOAuthToken(), { pickingConfig: { maxItemCount: String(PHOTOS_MAX_PICK) } });
  return { id: s.id, uri: s.pickerUri + '/autoclose', pollMs: durMs_((s.pollingConfig || {}).pollInterval, 4000) };
}

/** Has the user finished picking? Returns { ready, pollMs }. */
function photosPoll(sessionId) {
  requireId_(sessionId);
  const s = api_('get', PICKER_API + 'sessions/' + sessionId, ScriptApp.getOAuthToken());
  return { ready: !!s.mediaItemsSet, pollMs: durMs_((s.pollingConfig || {}).pollInterval, 4000) };
}

/** One page of what was picked, for display. thumbs = true adds small thumbnails as data URLs. */
function photosList(sessionId, pageToken, thumbs) {
  requireId_(sessionId);
  const src = ScriptApp.getOAuthToken();
  const res = pickedPage_(sessionId, pageToken, src);
  const raw = res.mediaItems || [];
  const items = raw.map(m => {
    const f = m.mediaFile || {};
    return { id: m.id, name: f.filename || m.id, mime: f.mimeType || '', video: m.type === 'VIDEO', created: m.createTime || '', thumb: '' };
  });
  if (thumbs && raw.length) {
    try {
      const got = UrlFetchApp.fetchAll(raw.map(m => ({
        url: (m.mediaFile || {}).baseUrl + '=w180-h180-c', headers: { Authorization: 'Bearer ' + src }, muteHttpExceptions: true
      })));
      got.forEach((r, i) => {
        if (r.getResponseCode() !== 200) return;
        const b = r.getBlob();
        items[i].thumb = 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes());
      });
    } catch (e) { /* thumbnails are a nicety */ }
  }
  return { items: items, nextPageToken: res.nextPageToken || null };
}

/** Done with a picker session: let Google drop it. */
function photosForget(sessionId) {
  requireId_(sessionId);
  call_('delete', PICKER_API + 'sessions/' + sessionId, ScriptApp.getOAuthToken());
}

/** Start a copy job for everything picked in a session. Pass the state to photosCopyBatch until done = true. */
function photosStartCopy(sessionId) {
  requireId_(sessionId);
  const d = destToken_();
  return {
    sessionId: sessionId, dest: d.email, album: destAlbum_(d),
    queue: [], urls: {}, urlsAt: 0, listed: false, total: 0,
    current: null, pending: [], results: [],
    copied: 0, failed: 0, bytes: 0, done: false
  };
}

/** Copy as much as fits in a short time slice, then hand the state back to the browser. */
function photosCopyBatch(state) {
  const start = Date.now();
  state.results = [];
  const d = destToken_();
  if (d.email !== state.dest) throw new Error('The account to copy to has changed. Pick the photos again.');
  const src = ScriptApp.getOAuthToken();

  while (!state.listed || state.current || state.queue.length) {
    if (!state.listed || Date.now() - state.urlsAt > PHOTO_URL_TTL_MS) refreshPicked_(state, src);
    if (!state.current) {
      if (!state.queue.length) break;
      state.current = { id: state.queue.shift(), offset: 0, upload: null, retried: false };
    }
    const id = state.current.id;
    try {
      copyChunk_(state, src);
    } catch (e) {
      photoResult_(state, id, 'error', errMsg_(e));
      state.current = null;
    }
    if (state.pending.length >= 50) flushPhotos_(state);
    if (Date.now() - start > PHOTOS_BATCH_MS) break;
  }
  while (state.pending.length) flushPhotos_(state);
  state.done = state.listed && !state.current && !state.queue.length;
  if (state.done) state.urls = {};
  return state;
}

/** Download the next chunk of the current item and pass it on to the other account. */
function copyChunk_(state, src) {
  const c = state.current;
  const m = state.urls[c.id];
  if (!m) throw new Error('No longer in the picked set.');
  let res;
  try {
    res = UrlFetchApp.fetch(m.u + (m.video ? '=dv' : '=d'), {
      headers: { Authorization: 'Bearer ' + src, Range: 'bytes=' + c.offset + '-' + (c.offset + PHOTOS_CHUNK - 1) },
      muteHttpExceptions: true
    });
  } catch (e) {
    if (/size|large|exceed/i.test(errMsg_(e))) throw new Error('Too big to copy: Google sent it in one piece, and Apps Script can take at most 50 MB at a time.');
    throw e;
  }
  const code = res.getResponseCode();
  if ((code === 401 || code === 403 || code === 404) && !c.retried) {
    c.retried = true; // the download link may have run out: get fresh ones and try again
    refreshPicked_(state, src);
    return;
  }
  if (code !== 200 && code !== 206) throw new Error('Download failed (HTTP ' + code + ').');

  const h = lowerKeys_(res.getHeaders());
  const blob = res.getBlob();
  let len, total;
  if (code === 206) {
    const r = /bytes\s+(\d+)-(\d+)\/(\d+)/i.exec(h['content-range'] || '');
    if (!r) throw new Error('Unexpected download response.');
    len = Number(r[2]) - Number(r[1]) + 1;
    total = Number(r[3]);
  } else {
    if (c.offset) throw new Error('The download started over halfway through. Pick this one again.');
    len = total = Number(h['content-length']) || blob.getBytes().length;
  }

  const dst = destToken_().access;
  const last = c.offset + len >= total;
  let token;
  if (!c.offset && last) {
    token = upload_(LIBRARY_API + 'uploads', dst, { 'X-Goog-Upload-Content-Type': m.mime, 'X-Goog-Upload-Protocol': 'raw' }, blob);
  } else {
    if (!c.upload) c.upload = startUpload_(dst, m.mime, total);
    const body = upload_(c.upload, dst, { 'X-Goog-Upload-Command': last ? 'upload, finalize' : 'upload', 'X-Goog-Upload-Offset': String(c.offset) }, blob);
    if (!last) {
      c.offset += len;
      photoResult_(state, c.id, 'progress', '', { done: c.offset, total: total });
      return;
    }
    token = body;
  }
  state.pending.push({ id: c.id, token: token.trim(), name: m.name, bytes: total });
  state.current = null;
}

/** Turn uploaded bytes into Google Photos items (50 at a time), in the album when there is one. */
function flushPhotos_(state) {
  const batch = state.pending.splice(0, 50);
  const dst = destToken_().access;
  const body = { newMediaItems: batch.map(p => ({ simpleMediaItem: { uploadToken: p.token, fileName: p.name } })) };
  if (state.album) body.albumId = state.album.id;
  let res = call_('post', LIBRARY_API + 'mediaItems:batchCreate', dst, body);
  if (res.code >= 300 && state.album) {
    // the album may have been deleted: try without it, and forget it if that works
    delete body.albumId;
    res = call_('post', LIBRARY_API + 'mediaItems:batchCreate', dst, body);
    if (res.code < 300) {
      PropertiesService.getUserProperties().deleteProperty(ALBUM_KEY + state.dest);
      state.album = null;
    }
  }
  if (res.code >= 300) { batch.forEach(p => photoResult_(state, p.id, 'error', res.error)); return; }
  const byToken = {};
  (res.data.newMediaItemResults || []).forEach(r => { byToken[r.uploadToken] = r; });
  batch.forEach(p => {
    const r = byToken[p.token] || {};
    if (r.mediaItem) {
      state.copied++;
      state.bytes += p.bytes;
      photoResult_(state, p.id, 'copied', '', { bytes: p.bytes });
    } else {
      photoResult_(state, p.id, 'error', (r.status || {}).message || 'Google Photos didn\'t accept it.');
    }
  });
}

/** List everything picked: fresh download links, and on the first call the order to copy in. */
function refreshPicked_(state, src) {
  const urls = {};
  const order = [];
  let pageToken = null;
  do {
    const res = pickedPage_(state.sessionId, pageToken, src);
    (res.mediaItems || []).forEach(m => {
      const f = m.mediaFile || {};
      urls[m.id] = { u: f.baseUrl, mime: f.mimeType || 'application/octet-stream', name: f.filename || m.id, video: m.type === 'VIDEO' };
      order.push(m.id);
    });
    pageToken = res.nextPageToken;
  } while (pageToken);
  state.urls = urls;
  state.urlsAt = Date.now();
  if (!state.listed) { state.queue = order; state.total = order.length; state.listed = true; }
}

function pickedPage_(sessionId, pageToken, src) {
  return api_('get', PICKER_API + 'mediaItems?sessionId=' + encodeURIComponent(sessionId) + '&pageSize=100' +
    (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), src);
}

function startUpload_(dst, mime, total) {
  const res = UrlFetchApp.fetch(LIBRARY_API + 'uploads', {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + dst, 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Content-Type': mime, 'X-Goog-Upload-Raw-Size': String(total)
    },
    muteHttpExceptions: true
  });
  const url = lowerKeys_(res.getHeaders())['x-goog-upload-url'];
  if (res.getResponseCode() >= 300 || !url) throw new Error('Couldn\'t start the upload (HTTP ' + res.getResponseCode() + ').');
  return url;
}

function upload_(url, dst, headers, blob) {
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/octet-stream', payload: blob,
    headers: Object.assign({ Authorization: 'Bearer ' + dst }, headers), muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error('Upload failed (HTTP ' + res.getResponseCode() + ').');
  return res.getContentText();
}

function photoResult_(state, id, status, detail, extra) {
  if (status === 'error') state.failed++;
  state.results.push(Object.assign({ id: id, status: status, detail: detail || '' }, extra || {}));
}

/* ---- the other account's sign-in ---- */

function photosClient_() {
  const p = PropertiesService.getScriptProperties();
  return { id: p.getProperty('PHOTOS_CLIENT_ID') || '', secret: p.getProperty('PHOTOS_CLIENT_SECRET') || '' };
}

function destRedirect_() {
  return 'https://script.google.com/macros/d/' + ScriptApp.getScriptId() + '/usercallback';
}

function destAuthUrl_(hint) {
  const q = {
    client_id: photosClient_().id, redirect_uri: destRedirect_(), response_type: 'code', scope: DEST_SCOPES,
    access_type: 'offline', prompt: 'consent select_account',
    state: ScriptApp.newStateToken().withMethod('photosAuthCallback').withTimeout(3600).createToken()
  };
  hint = String(hint || '').trim().toLowerCase();
  if (EMAIL_RE.test(hint) && hint !== getMe().toLowerCase()) q.login_hint = hint;
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&');
}

function destGet_() {
  try { return JSON.parse(PropertiesService.getUserProperties().getProperty(DEST_KEY) || 'null'); } catch (e) { return null; }
}

function destSave_(d) {
  PropertiesService.getUserProperties().setProperty(DEST_KEY, JSON.stringify(d));
}

/** The other account with a working access token, refreshed when it's about to run out. */
function destToken_() {
  const d = destGet_();
  if (!d) throw new Error('Connect the account to copy to first.');
  if (d.access && d.exp - 60 * 1000 > Date.now()) return d;
  const c = photosClient_();
  let tok;
  try {
    tok = postForm_('https://oauth2.googleapis.com/token', { client_id: c.id, client_secret: c.secret, refresh_token: d.refresh, grant_type: 'refresh_token' });
  } catch (e) {
    if (/invalid_grant|revoked|expired/i.test(errMsg_(e))) {
      PropertiesService.getUserProperties().deleteProperty(DEST_KEY);
      throw new Error('Offload lost access to ' + d.email + '. Connect it again.');
    }
    throw e;
  }
  d.access = tok.access_token;
  d.exp = Date.now() + (tok.expires_in || 3600) * 1000;
  destSave_(d);
  return d;
}

/** The "Copied from <me>" album in the other account, created the first time. null if it can't be made. */
function destAlbum_(d) {
  const props = PropertiesService.getUserProperties();
  try {
    const saved = JSON.parse(props.getProperty(ALBUM_KEY + d.email) || 'null');
    if (saved) return saved;
  } catch (e) { /* make a new one */ }
  const res = call_('post', LIBRARY_API + 'albums', d.access, { album: { title: 'Copied from ' + getMe() } });
  if (res.code >= 300 || !res.data.id) return null;
  const album = { id: res.data.id, url: res.data.productUrl || '' };
  props.setProperty(ALBUM_KEY + d.email, JSON.stringify(album));
  return album;
}

function authPage_(ok, msg) {
  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>body{margin:0;background:#EEF1F4;color:#1D2A33;font:15px/1.55 system-ui,sans-serif}' +
    '.card{max-width:440px;margin:15vh auto 0;background:#fff;border-radius:16px;padding:28px;box-shadow:0 8px 24px -16px rgba(29,42,51,.25)}' +
    'h1{font-size:19px;margin:0 0 8px}p{margin:0;color:#3C4B56}.ok{color:#245A4F}.bad{color:#A63D36}</style></head><body>' +
    '<div class="card"><h1 class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'Connected' : 'Not connected') + '</h1><p>' + htmlEsc_(msg) + '</p></div>' +
    (ok ? '<script>setTimeout(function(){try{window.top.close()}catch(e){}},1500)</script>' : '') +
    '</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Offload').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---- HTTP ---- */

/** JSON request that never throws: { code, data, error }. */
function call_(method, url, token, body) {
  const opts = { method: method, headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
  if (body !== undefined) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(body); }
  const res = UrlFetchApp.fetch(url, opts);
  const code = res.getResponseCode();
  let data = {};
  try { data = JSON.parse(res.getContentText() || '{}'); } catch (e) { data = {}; }
  const error = code >= 300 ? ((data.error && data.error.message) || 'Request failed (HTTP ' + code + ').') : '';
  return { code: code, data: data, error: error };
}

function api_(method, url, token, body) {
  const res = call_(method, url, token, body);
  if (res.code >= 300) throw new Error(res.error);
  return res.data;
}

function postForm_(url, form) {
  const res = UrlFetchApp.fetch(url, { method: 'post', payload: form, muteHttpExceptions: true });
  let data = {};
  try { data = JSON.parse(res.getContentText() || '{}'); } catch (e) { data = {}; }
  if (res.getResponseCode() >= 300) throw new Error(data.error_description || data.error || 'Sign-in failed (HTTP ' + res.getResponseCode() + ').');
  return data;
}

function jwtClaims_(jwt) {
  const part = String(jwt || '').split('.')[1] || '';
  const padded = part + '==='.slice((part.length + 3) % 4);
  return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString());
}

function durMs_(s, fallback) {
  const m = /^([\d.]+)s$/.exec(String(s || ''));
  return m ? Math.max(1000, Number(m[1]) * 1000) : fallback;
}

function lowerKeys_(o) {
  const out = {};
  Object.keys(o || {}).forEach(k => { out[k.toLowerCase()] = Array.isArray(o[k]) ? o[k][0] : o[k]; });
  return out;
}

function htmlEsc_(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
