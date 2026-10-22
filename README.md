# Offload

Move Google Drive files to your other Google account, and free up storage on the first one.

Pick whole folders, your largest files, or photos and videos, and hand them over in bulk. The receiving account accepts everything in one place. The app is a Google Apps Script web app, so it runs inside your own Google account: no server, no database, nothing leaves Google.

## What's here

| Path | What it is |
| --- | --- |
| `app/`, `components/`, `lib/` | The landing site (Next.js), deployed on Vercel. Landing page, privacy page, SEO metadata, sitemap, robots and manifest. |
| `apps-script/` | The app itself: `Code.gs`, `Index.html` and `appsscript.json` for a Google Apps Script project. |
| `brand/` | Logo, profile picture and banners for LinkedIn, X and link previews. |

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

## Limits

- Personal Gmail accounts. Work and school accounts usually block transfers outside their organisation.
- Only files you own can be transferred, and the other account must accept.
- Photos that live only in the Google Photos app can't be moved; photos stored in Drive can.

Offload isn't affiliated with Google. Google Drive and Gmail are trademarks of Google LLC.
