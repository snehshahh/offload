export const SITE_NAME = "Offload";
export const SITE_TITLE = "Offload: Free Google Drive Storage Manager & Bulk Transfer Tool";
export const SITE_SHORT_TITLE = "Move Google Drive files to your other account";
export const SITE_DESCRIPTION =
  "Free tool to manage Google Drive storage. Bulk move folders, large files and photos to your other Google account and free up storage in minutes. Nothing to install, files never leave Google.";

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
  "https://script.google.com/macros/s/AKfycbyWOVB_xmZ5VivLYiY6_wk1kyqIDwlzB6RDjTzhjxypJreil_V7naw8giFFXvLr4y5oeA/exec";

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
    q: "Can I move Google Drive files to another account in bulk for free?",
    a: "Yes. Offload is a free bulk transfer tool: pick whole folders, every file over 100 MB, or a screen full of photos, and move them all to your other Google account in one go instead of one file at a time.",
  },
  {
    q: "How do I free up Google storage without deleting anything?",
    a: "Move files to another Google account you own. Offload transfers ownership, so the files keep existing in your other account and stop counting against the full one. Nothing is deleted, and the structure of your folders is kept.",
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
    q: "Can I move my Google Photos to another account?",
    a: "Yes, as a copy. Google Photos has no way to hand photos to another account, so Offload copies the ones you pick, up to 2,000 at a time, into your other account's Google Photos and gathers them in an album. Your originals stay where they are: delete them once you've checked the copies, and that frees the space. Some very large videos may not copy.",
  },
  {
    q: "Can it clean up Gmail too?",
    a: "Yes. The Gmail tab finds emails in bulk with quick filters like Promotions, bigger than 10 MB or older than a year, or by words, subject and sender. It shows how many match, then moves them to Trash once you confirm. Starred and important emails are left alone by default, and anything trashed can be restored for 30 days.",
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
