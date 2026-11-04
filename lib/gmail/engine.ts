import { gmail, type Account } from "@/lib/drive/api";
import { count } from "@/lib/drive/engine";

/**
 * Gmail cleanup for the Offload web app.
 *
 * Quick filters plus free-text fields build one Gmail search, which is counted and previewed. Trashing runs in
 * slices that always search from the top (trashed mail drops out of the results), never trash more than the person
 * confirmed, and skip conversations already handled in case the search index lags. Nothing is deleted for good:
 * Gmail empties its Trash after 30 days, or the person does. Only message headers (subject, sender, date) of the
 * newest few matches are ever read, to show what a search found.
 */

export const GMAIL_FILTERS = {
  promotions: { label: "Promotions", q: "category:promotions" },
  social: { label: "Social", q: "category:social" },
  updates: { label: "Updates", q: "category:updates" },
  large: { label: "Bigger than 10 MB", q: "larger:10M" },
  attachment: { label: "Has attachments", q: "has:attachment" },
  old: { label: "Older than a year", q: "older_than:1y" },
} as const;
export type GmailFilter = keyof typeof GMAIL_FILTERS;

export type GmailSearch = { filters: GmailFilter[]; words?: string; subject?: string; from?: string; keepStarred?: boolean };

const COUNT_CAP = 10_000;
const PREVIEW = 20;
const CONCURRENCY = 5;

/** The Gmail search for these choices. Throws if nothing was chosen. */
export function gmailQuery(f: GmailSearch): string {
  const parts: string[] = [];
  for (const k of f.filters || []) if (GMAIL_FILTERS[k]) parts.push(GMAIL_FILTERS[k].q);
  const from = String(f.from || "").replace(/[()"]/g, " ").trim();
  if (from) parts.push(`from:(${from})`);
  const subject = String(f.subject || "").replace(/"/g, " ").trim();
  if (subject) parts.push(`subject:("${subject}")`);
  const words = String(f.words || "").trim();
  if (words) parts.push(words);
  if (!parts.length) throw new Error("Pick a quick filter or type something to search for.");
  if (f.keepStarred !== false) parts.push("-is:starred -is:important");
  return parts.join(" ");
}

/** Opens the same search in Gmail, signed in as `email`. */
export function gmailSearchUrl(email: string, query: string) {
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}#search/${encodeURIComponent(query)}`;
}

export function gmailTrashUrl(email: string) {
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}#trash`;
}

export type GmailItem = { id: string; subject: string; from: string; date: string; messages: number };

async function pool<T>(items: T[], fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

function header(msg: any, name: string): string {
  const h = (msg?.payload?.headers || []).find((x: any) => String(x.name).toLowerCase() === name.toLowerCase());
  return h ? String(h.value) : "";
}

/** "Shop Deals <deals@shop.com>" → "Shop Deals" */
function senderName(from: string): string {
  const m = /^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/.exec(from);
  return (m ? m[1] : from).trim();
}

/** Counts matching conversations (up to 10,000) and fetches the newest 20 to show. */
export async function gmailPreview(acct: Account, f: GmailSearch, budgetMs = 15_000) {
  const query = gmailQuery(f);
  const start = Date.now();
  let total = 0;
  let capped = false;
  let first: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail(acct, "GET", "threads", { q: query, maxResults: 500, pageToken, fields: "threads(id),nextPageToken" });
    const ids: string[] = (res.threads || []).map((t: any) => t.id);
    if (!first.length) first = ids;
    total += ids.length;
    pageToken = res.nextPageToken;
    if (pageToken && (total >= COUNT_CAP || Date.now() - start > budgetMs)) {
      capped = true;
      break;
    }
  } while (pageToken);

  const shown = first.slice(0, PREVIEW);
  const items: GmailItem[] = new Array(shown.length);
  await pool(
    shown.map((id, i) => [id, i] as const),
    async ([id, i]) => {
      try {
        const t = await gmail(acct, "GET", `threads/${id}`, {
          format: "metadata",
          metadataHeaders: ["Subject", "From"],
          fields: "id,messages(internalDate,payload/headers)",
        });
        const msgs = t.messages || [];
        const last = msgs[msgs.length - 1];
        items[i] = {
          id,
          subject: header(msgs[0], "Subject") || "(no subject)",
          from: senderName(header(msgs[0], "From")),
          date: last?.internalDate ? new Date(Number(last.internalDate)).toISOString() : "",
          messages: msgs.length,
        };
      } catch {
        items[i] = { id, subject: "(couldn't load this one)", from: "", date: "", messages: 0 };
      }
    }
  );
  const n = capped ? `More than ${count(total, "conversation")}` : count(total, "conversation");
  const message = total ? `${n} match${total === 1 && !capped ? "es" : ""} in ${acct.e}.` : `No conversations match in ${acct.e}.`;
  return { query, count: total, capped, items, message };
}

export type TrashState = {
  query: string;
  /** How many the person confirmed; 0 = everything that matches. */
  limit: number;
  trashed: number;
  failed: number;
  seen: string[];
  done: boolean;
  message: string;
};

export function startTrash(f: GmailSearch, limit: number): TrashState {
  return { query: gmailQuery(f), limit: Math.max(0, Math.floor(limit) || 0), trashed: 0, failed: 0, seen: [], done: false, message: "" };
}

/** Moves a slice of matching conversations to Trash, for up to `budgetMs`. Call again until done. */
export async function trashSlice(acct: Account, prev: TrashState, budgetMs = 4000): Promise<TrashState> {
  const state: TrashState = { ...prev, seen: [...prev.seen] };
  const seen = new Set(state.seen);
  const start = Date.now();
  let pageToken: string | undefined;
  while (!state.done && Date.now() - start < budgetMs) {
    const left = state.limit ? state.limit - state.trashed - state.failed : 100;
    if (left <= 0) {
      state.done = true;
      break;
    }
    const res = await gmail(acct, "GET", "threads", { q: state.query, maxResults: 100, pageToken, fields: "threads(id),nextPageToken" });
    const ids: string[] = (res.threads || []).map((t: any) => t.id);
    const fresh = ids.filter((id) => !seen.has(id)).slice(0, Math.min(left, 100));
    if (!fresh.length) {
      // The search hasn't caught up with what's already in Trash: look further down, or stop.
      if (res.nextPageToken) {
        pageToken = res.nextPageToken;
        continue;
      }
      state.done = true;
      break;
    }
    await pool(fresh, async (id) => {
      seen.add(id);
      try {
        await gmail(acct, "POST", `threads/${id}/trash`, { fields: "id" });
        state.trashed++;
      } catch {
        state.failed++;
      }
    });
    pageToken = undefined;
  }
  state.seen = [...seen];
  const failed = state.failed ? ` ${count(state.failed, "conversation")} couldn't be moved.` : "";
  state.message = state.done
    ? (state.trashed
        ? `Moved ${count(state.trashed, "conversation")} to Trash in ${acct.e}.`
        : `Nothing left to move: no conversations match in ${acct.e}.`) +
      failed +
      (state.trashed
        ? " They stay in Trash for 30 days, then Gmail deletes them; the space frees up then, or straight away if you empty the Trash."
        : "")
    : `Moving to Trash in ${acct.e}: ${state.trashed.toLocaleString("en-US")}${state.limit ? ` of ${state.limit.toLocaleString("en-US")}` : ""} so far. Carrying on…`;
  return state;
}
