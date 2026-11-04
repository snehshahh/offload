# Offload

Move Google Drive files to your other Google account, and free up storage on the first one.

Pick whole folders, your largest files, or photos and videos, and hand them over in bulk. Photos that live in Google Photos can be copied across too, and the Gmail tab finds emails in bulk and moves them to Trash. The receiving account accepts everything in one place. The app is a Google Apps Script web app, so it runs inside your own Google account: no server, no database, nothing leaves Google.

## What's here

| Path | What it is |
| --- | --- |
| `app/`, `components/`, `lib/` | The landing site (Next.js), deployed on Vercel. Landing page, blog (posts live in `lib/posts.ts`), privacy page, SEO metadata, sitemap, robots and manifest. |
| `apps-script/` | The app itself: `Code.gs`, `Index.html` and `appsscript.json` for a Google Apps Script project. |
| `app/app`, `components/app`, `lib/drive/` | The Offload web app (beta) at `/app`: the Drive part of Offload running in the browser, and the Drive engine it shares with the connector. |
| `app/mcp`, `app/oauth`, `app/.well-known`, `lib/mcp/` | Offload for Claude: an MCP connector, so people can move files by asking Claude. Runs on the same Vercel deployment. |
| `brand/` | Logo, profile picture and banners for LinkedIn, X and link previews. |
| `public/google0aa1b7412de3fcf6.html` | Google Search Console ownership verification. Keep it, or the site loses verification. |

## Landing site

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

Environment variables (all optional):

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLASSIC_APP_URL` | The classic Apps Script app, linked from the web app as a fallback (`NEXT_PUBLIC_APP_URL` still works for this). Every "Open Offload" button goes to `/app`. |
| `NEXT_PUBLIC_SITE_URL` | The site's public address, for a custom domain. On Vercel, the production address is used automatically. |

## Run the app yourself

1. Create a project at [script.google.com](https://script.google.com).
2. In Project Settings, tick **Show "appsscript.json" manifest file in editor**.
3. Paste `appsscript.json` and `Code.gs`, then add an HTML file named `Index` and paste `Index.html`.
4. **Deploy → New deployment → Web app**, Execute as **User accessing the web app**, Who has access **Anyone with a Google account**.

To update later: **Deploy → Manage deployments → Edit → Version: New version** (the URL stays the same).

## Google Photos

Google Photos has no ownership transfer, so the Google Photos tab copies instead. The signed-in account picks photos in Google's own picker, Offload uploads each one to the other account's Google Photos and adds it to an album called "Copied from &lt;email&gt;", and the user deletes the originals afterwards. The other account signs in once, with add-only access.

Setup is needed once per deployment. Until it's done, the tab says so and the rest of the app works as before.

1. **Use a standard Google Cloud project.** Create one at [console.cloud.google.com](https://console.cloud.google.com), then in Apps Script go to **Project Settings → Google Cloud Platform (GCP) Project → Change project** and enter its project number. Apps Script's default project can't turn on extra APIs.
2. **Turn on the APIs.** In that project, enable the **Google Photos Picker API** and the **Photos Library API**.
3. **Consent screen.** Under **Google Auth Platform**, set up the consent screen (External) and add these scopes: `photospicker.mediaitems.readonly`, `photoslibrary.appendonly`, plus the Drive, Gmail (`https://mail.google.com/`), email and `script.external_request` scopes the app already uses. While the app is in testing, add each Google account that will use it as a test user.
4. **OAuth client for the second account.** Under **Clients**, create a **Web application** client with this authorised redirect URI, where `SCRIPT_ID` is in Apps Script's Project Settings:

   ```
   https://script.google.com/macros/d/SCRIPT_ID/usercallback
   ```
5. **Script properties.** In Apps Script, **Project Settings → Script properties**, add `PHOTOS_CLIENT_ID` and `PHOTOS_CLIENT_SECRET` with that client's values.
6. Deploy a new version. Anyone already using the app is asked to approve the new Photos permission once.

How it copies: each photo is downloaded and uploaded in 32 MB pieces, in short calls so the progress bar keeps moving, and up to 2,000 photos can be picked at a time. The browser tab has to stay open while it runs.

## Gmail

The Gmail tab is the former Trash Wizard add-on, rebuilt inside the app. Quick filters (Promotions, Social, Updates, bigger than 10 MB, has attachments, older than a year) and the "Has the words", "Subject contains" and "From" fields build one Gmail search. The tab counts the matches as you type and shows the newest 20. After a two-click confirm it moves them to Trash in batches. Starred and important emails are left alone unless the user unticks that option, and it never trashes more than the number the user confirmed. Nothing is deleted for good: Gmail empties its Trash after 30 days, and the done message links to the Trash for emptying it sooner.

It uses the `https://mail.google.com/` scope, which Google classes as restricted. An unverified app can be used by up to 100 accounts; going past that means Google's restricted-scope verification, including a security assessment.

## Offload web app (beta): `/app`

The Drive part of Offload, rebuilt as a page on this site so it no longer needs Apps Script. It runs entirely in the browser: Google Identity Services gives the tab a short-lived Drive token for each account you sign in with (up to 5), and the page talks to the Drive API directly. Tokens never reach this site's server. Because every account is signed in, a transfer is requested by the sender and accepted by the receiver in one step.

- **Tabs:** Folders (browse My Drive, sizes added up in the background), Large files, Photos & videos (thumbnails), and Waiting to accept (transfers started elsewhere, such as the classic app, accepted in one click).
- **Shared engine:** `lib/drive/engine.ts` is the same code the Claude connector uses. `lib/drive/api.ts` is the Drive caller; the browser plugs in its tokens via `lib/drive/browserAuth.ts`, the server via `lib/mcp/google.ts`.
- **Expired sign-ins:** tokens last about an hour. If one runs out mid-job, the job pauses and a banner asks for one click on Continue (Google's window may only open on a click), then it carries on.
- **Gmail cleanup** (`lib/gmail/engine.ts`): the same quick filters and fields as the classic app, a live count and the newest 20 matches, a two-click confirm, and trashing in slices that never go past the confirmed number and skip conversations already handled. It asks for Gmail permission only when the tab is opened, per account, with the narrower `gmail.modify` scope (search and Trash; it can't delete for good), and reads only the subject, sender and date of the matches it shows.
- **Google Photos** (`lib/photos/`): the same copy as the classic app. The source account picks in Google's own picker (`photospicker.mediaitems.readonly`), each item is copied in 16 MB pieces into the receiving account's Google Photos (`photoslibrary.appendonly`), and they're gathered in an album "Copied from <email>"; originals stay put. Picking, the album and `batchCreate` run in the browser. The bytes go through `/api/photos/copy` (`lib/photos/relay.ts`), because browsers can't read the `Content-Range` and `X-Goog-Upload-URL` headers piece-by-piece copying needs: each call downloads one piece from the source and hands it to the receiver's resumable upload, stores nothing, only talks to `*.googleusercontent.com` and `photoslibrary.googleapis.com`, and refuses calls from other sites. Expired download links and sign-ins are refreshed once and retried; a file Google won't send in pieces can be copied up to 100 MB. That traffic counts towards the Vercel project's data transfer.

Setup: it uses the same `GOOGLE_CLIENT_ID` as the connector. In Google Cloud, that client needs your site under **Authorised JavaScript origins** (e.g. `https://offload-five-mu.vercel.app`), the **Gmail API**, **Photos Picker API** and **Photos Library API** must be enabled, `https://www.googleapis.com/auth/gmail.modify`, `photospicker.mediaitems.readonly` and `photoslibrary.appendonly` must be on the consent screen's **Data Access** list, and every account that signs in must be a test user while the consent screen is in Testing.

## Offload for Claude (MCP connector)

The landing site also serves an MCP server at `/mcp`. Added to Claude as a custom connector, it lets someone ask, in the chat, things like "what's taking up space in my Drive?" or "move every video over 500 MB to my other account", and Claude does the transfer.

When the connector is added, the person signs in with 2 to 5 Google accounts, first their main account (the one to free up) and then the ones that receive files. Because the connector holds them all, each transfer is requested by the sender and accepted by the receiver in the same step, so nobody has to open the other account. To change the set of accounts, remove the connector in Claude and add it again. Moved items keep their folder structure, and loose ones land in "Transferred from &lt;sender&gt;", just as in the web app.

Tools:

| Tool | What it does |
| --- | --- |
| `get_accounts` | Every linked account's storage: used, total, free, % used, status (ok / almost full / full) and what's using it, plus totals and which account has the most room. |
| `find_files` | Finds files or folders and says which account each is in. Without an account it searches all of them, so "where's my wedding video?" just works. Biggest first, by type (images, videos, documents, folders), minimum size, name, or inside a folder. `moved_only` lists what Offload moved into an account. |
| `folder_size` | Space the files an account owns inside a folder take up, subfolders included. |
| `transfer_files` | Moves files and folders (with their contents) from one linked account to another (`from_account`, `to_account`; with two accounts the receiver defaults to the other one). Big jobs run in steps of about 40 seconds and hand back a `continue_token`; Claude keeps calling until `done` is true. Safe to repeat, and reversible by transferring back. |

Every tool result starts with a `message`: one plain sentence Claude can pass on as it is, such as "Moved 41 files and 2 folders (6.2 GB) from you@gmail.com to archive@gmail.com. Skipped 3 that belong to someone else." or, mid-job, "Still moving: 120 files so far (3.4 GB). Carrying on…". After a move it also says roughly where the sending account's storage should land once Google catches up.

Moved items remember where they came from: each one gets private Drive `appProperties` (`offloadedFrom`, `offloadedAt`) that only this OAuth client can see, and `find_files` shows them as `moved_here_from` and `moved_on`. Where a file is now is always read live from Drive, so it can't go stale.

There's no database. The connector is its own OAuth server for Claude (discovery, dynamic client registration, PKCE), and everything it has to remember, the two Google sign-ins included, is sealed with AES-256-GCM under `MCP_TOKEN_SECRET` and held by Claude as its token.

### Setup

1. **Google Cloud.** Use the standard Google Cloud project from the Google Photos setup (or any standard project). Enable the **Google Drive API** there. On the consent screen, make sure the `openid`, `email` and `https://www.googleapis.com/auth/drive` scopes are listed, and while it's in testing, add each Google account that will connect as a test user.
2. **OAuth client.** Under **Clients**, create a **Web application** client (or add to an existing one) with this authorised redirect URI:

   ```
   https://YOUR-SITE/oauth/callback
   ```
3. **Vercel environment variables:**

   | Variable | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | That client's ID and secret. |
   | `MCP_TOKEN_SECRET` | At least 32 random characters, e.g. from `openssl rand -base64 48`. Changing it signs every connection out. |
   | `MCP_PUBLIC_URL` | Optional. The site's public address, if requests reach it under another host name. |

4. **Redeploy**, then in Claude go to **Settings → Connectors → Add custom connector**, enter `https://YOUR-SITE/mcp` and select **Connect**.

While the consent screen's publishing status is **Testing**, Google lets only test users sign in and expires the sign-ins after 7 days. When that happens Claude says so, and the person removes and adds the connector again. Publishing the app (for the Drive scope that means Google's verification) removes both limits.

To try it locally: `npm run build && npm start` with the three variables set, add `http://localhost:3000/oauth/callback` to the OAuth client, and point an MCP client such as the MCP Inspector at `http://localhost:3000/mcp`.

## Limits

- Personal Gmail accounts. Work and school accounts usually block transfers outside their organisation.
- Only files you own can be transferred, and the other account must accept.
- Google Photos items are copied, not moved: space frees up only once the originals are deleted. A file Google won't send in pieces can't be copied if it's over 50 MB, Apps Script's limit per request.
- If several Google accounts are signed in to the same browser, Apps Script web apps can pick the wrong one. Signing in to the second account for Google Photos works best when the account you copy from is the browser's first (default) account, or in its own browser profile.

Offload isn't affiliated with Google. Google Drive and Gmail are trademarks of Google LLC.
