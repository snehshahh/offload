# Offload

Move Google Drive files to your other Google account, and free up storage on the first one.

Pick whole folders, your largest files, or photos and videos, and hand them over in bulk. Photos that live in Google Photos can be copied across too, and the Gmail tab finds emails in bulk and moves them to Trash. The receiving account accepts everything in one place. The app is a Google Apps Script web app, so it runs inside your own Google account: no server, no database, nothing leaves Google.

## What's here

| Path | What it is |
| --- | --- |
| `app/`, `components/`, `lib/` | The landing site (Next.js), deployed on Vercel. Landing page, blog (posts live in `lib/posts.ts`), privacy page, SEO metadata, sitemap, robots and manifest. |
| `apps-script/` | The app itself: `Code.gs`, `Index.html` and `appsscript.json` for a Google Apps Script project. |
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
| `NEXT_PUBLIC_APP_URL` | The Apps Script web app URL that every "Open Offload" button links to. |
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

## Limits

- Personal Gmail accounts. Work and school accounts usually block transfers outside their organisation.
- Only files you own can be transferred, and the other account must accept.
- Google Photos items are copied, not moved: space frees up only once the originals are deleted. A file Google won't send in pieces can't be copied if it's over 50 MB, Apps Script's limit per request.
- If several Google accounts are signed in to the same browser, Apps Script web apps can pick the wrong one. Signing in to the second account for Google Photos works best when the account you copy from is the browser's first (default) account, or in its own browser profile.

Offload isn't affiliated with Google. Google Drive and Gmail are trademarks of Google LLC.
