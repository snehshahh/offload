export const SITE_NAME = "Offload";
export const SITE_TITLE = "Offload: move Google Drive files to your other Google account";
export const SITE_SHORT_TITLE = "Move Google Drive files to your other account";
export const SITE_DESCRIPTION =
  "Google storage full? Offload moves folders, large files and photos from one Google account to another in bulk, so the space frees up. Free, nothing to install, and your files never leave Google.";

/** Public address of the site. Set NEXT_PUBLIC_SITE_URL for a custom domain; Vercel's production address is used otherwise. */
export const SITE_URL = (() => {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
})();

/** The Offload app (Google Apps Script web app). Set NEXT_PUBLIC_APP_URL when you deploy a new version. */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://script.google.com/macros/s/AKfycbwhsUezPwUCstFRxbQx6MxJ7mNqRL3zTTJYCMcAzV9JHXI9uj83ivAzEzidsr5DwRwp/exec";

export const FAQS: { q: string; a: string }[] = [
  {
    q: "Is Offload free?",
    a: "Yes. It's free to use, and there's nothing to sign up for beyond the Google accounts you already have.",
  },
  {
    q: "Where do my files go? Can anyone else see them?",
    a: "Your files stay inside Google the whole time. Offload uses Google Drive's own ownership transfer, so files go straight from one of your accounts to the other. They never pass through any other server, and the developer can't see them.",
  },
  {
    q: "Why does Google say the app isn't verified?",
    a: "Google shows this for apps that haven't finished its review yet. To continue, choose Advanced, then Go to Offload. Offload needs access to your Drive so it can list your files and hand their ownership to your other account.",
  },
  {
    q: "Does the other account have to accept?",
    a: "Yes. Google requires the receiving account to accept every transfer. In Offload, the receiving account opens Waiting for you and accepts everything at once. Loose files are tidied into a folder named after the account they came from.",
  },
  {
    q: "Will it free up space straight away?",
    a: "Space frees up once the other account accepts. Google can take a few hours to update the storage figures, and remember to empty the trash in the account the files came from.",
  },
  {
    q: "Can it move photos from the Google Photos app?",
    a: "No. Google doesn't allow apps to transfer photos that live only in Google Photos. Offload moves photos and videos stored in Google Drive. For your Photos library, use Google Photos' partner sharing or Google Takeout.",
  },
  {
    q: "Does it work with work or school accounts?",
    a: "Usually not. Most organisations block ownership transfers outside their domain. Offload is made for personal Gmail accounts.",
  },
  {
    q: "What happens to files other people shared with me?",
    a: "Only the owner of a file can transfer it, so Offload skips files that belong to someone else and tells you which ones they are.",
  },
];
