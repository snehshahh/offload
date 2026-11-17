import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { count, describeFind, findFiles, folderSize, human, listing, storage, transfer } from "@/lib/drive/engine";
import type { SizeState, TransferState } from "@/lib/drive/engine";
import { packCursor, unpackCursor } from "./cursor";
import type { Account } from "./google";
import { accessToken } from "./google"; // importing it also registers the server-side Google token source
import {
  copyPickedServer,
  copyResult,
  drivePreviews,
  driveTimeline,
  driveTimelineResult,
  inPeriod,
  MAX_PREVIEWS,
  pickedPreviews,
  pickedResult,
  picked,
  startPick,
  type CopyState,
  type DriveTimelineState,
  type PickToken,
  type Preview,
} from "@/lib/photos/connector";

/** How long one transfer_files call works before handing back a continue_token. */
const TRANSFER_BUDGET_MS = 40_000;
/** How long one photo_timeline or copy_google_photos call works before handing back a continue_token. */
const PHOTOS_BUDGET_MS = 35_000;

const INSTRUCTIONS = `Every result starts with "message": a plain summary you can pass on to the person as it is, adding detail from the rest of the result where it helps.

Offload moves Google Drive files between the person's own Google accounts (2 to 5 of them, linked when the connector was added) by transferring ownership, which frees storage in the account they leave. The first linked account is their main account.

Storage: get_accounts returns every account's storage. Show it as a small table (account, used, total, free, % used, status) followed by one line on which account has the most room. Google can take a few hours to update these numbers after a move.

Finding things: call find_files without account to search every linked account at once; each result group says which account holds those files (the owner, whose storage they use). The folders and files Offload moved are tagged with where they came from and when (moved_here_from, moved_on); a moved folder's contents aren't tagged one by one, they're inside the tagged folder. find_files with moved_only lists them (kind=folders for the folders).

Moving: get_accounts → find_files / folder_size to pick what to move → confirm with the person, listing what will move, how much space it frees, and which account receives it → transfer_files. With more than two accounts, ask which account should receive the files unless the person said so; get_accounts shows which has the most room. If transfer_files returns done: false, call it again with only continue_token until done is true, and tell the person how far it's got.

Only files the sending account owns can be moved; files owned by anyone else are skipped. Moved items keep their folder structure; loose ones land in "Transferred from <sender>" in the receiving account's My Drive. A transfer can be undone by moving the items back. Nothing is deleted.

Photos come in two kinds, and Google treats them differently:
- Photos and videos stored in Google Drive: photo_timeline counts all of them, month by month and year by year (count, size, video length, cameras, busiest month and year), and gives preview_ids for each month. If it returns done: false, call it again with only continue_token. Show the years as a small table, then the months the person asks about.
- The Google Photos library: Google only lets apps see photos the person picks. pick_google_photos returns a picker_url: give it to the person as a link, ask them to choose photos (they can pick up to 2,000) and press Done, and wait for them to say they've finished before calling picked_photos. Don't call picked_photos repeatedly while they're picking. picked_photos gives the same month and year timeline for the picked photos.
- show_photos shows small previews in the chat: pass Drive file IDs (preview_ids from photo_timeline, or IDs from find_files with kind=media), or a photos_session with an optional period (2019, or 2019-07) for picked Google Photos. Describe what's in them if the person asks.
- copy_google_photos copies picked Google Photos into another linked account's Google Photos, into an album "Copied from <account>". Confirm first. While done is false, call again with only continue_token. Originals stay put; the person deletes them in Google Photos to free the space. Drive photos are moved with transfer_files instead.
- If a tool says an account hasn't allowed Google Photos, pass on its message: the person reconnects Offload and leaves the Google Photos boxes ticked.`;

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function failure(e: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] };
}

/** `site` is this deployment's address (e.g. https://offload.example), so AI apps can show Offload's icon and link. */
export function buildServer(accounts: Account[], site?: string): McpServer {
  const server = new McpServer(
    {
      name: "offload",
      title: "Offload",
      version: "1.2.0",
      description:
        "Move Google Drive files between your Google accounts, see how much space each one has, browse your photos month by month and year by year, and copy Google Photos to another account.",
      ...(site
        ? {
            websiteUrl: site,
            icons: [
              { src: `${site}/icon-512.png`, mimeType: "image/png", sizes: ["512x512"] },
              { src: `${site}/icon-192.png`, mimeType: "image/png", sizes: ["192x192"] },
              { src: `${site}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
            ],
          }
        : {}),
    },
    { instructions: INSTRUCTIONS }
  );
  const main = accounts[0];
  const list = accounts.map((x) => x.e).join(", ");

  const find = (email: string): Account => {
    const e = email.trim().toLowerCase();
    const hit = accounts.find((x) => x.e === e);
    if (!hit) throw new Error(`${email} isn't linked. The linked accounts are ${list}.`);
    return hit;
  };
  const emailArg = (what: string) => z.string().optional().describe(`${what} One of: ${list}.`);

  server.registerTool(
    "get_accounts",
    {
      title: "Storage of every linked account",
      description:
        "Shows every linked Google account with its storage: used, total, free, % used, status (ok / almost full / full) and what's " +
        "using it (Drive, Drive trash, Gmail and Photos), plus totals and which account has the most room. Use it for " +
        "\"how much space do my accounts have?\" and before choosing where to move files.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const all = await Promise.all(accounts.map(storage));
        const rows = all.map(({ bytes, ...row }, i) => ({ ...row, role: i === 0 ? "main" : "linked" }));
        const limited = all.filter((s) => s.bytes.total !== null);
        const sum = (f: (s: (typeof all)[number]) => number) => limited.reduce((n, s) => n + f(s), 0);
        const byFree = [...limited].sort((x, y) => y.bytes.free! - x.bytes.free!);
        const byUse = [...limited].sort((x, y) => y.percent_used! - x.percent_used!);
        const unlimited = all.filter((s) => s.bytes.total === null).map((s) => s.email);
        const totalLine = limited.length
          ? `${human(sum((s) => s.bytes.used))} used of ${human(sum((s) => s.bytes.total!))}, ${human(sum((s) => s.bytes.free!))} free` +
            (unlimited.length ? ` (not counting ${listing(unlimited)}, which ${unlimited.length === 1 ? "has" : "have"} unlimited storage)` : "")
          : "all on unlimited plans";
        const tight = all.filter((s) => s.status === "full" || s.status === "almost full");
        const message = [
          `${count(all.length, "linked account")}: ${totalLine}.`,
          ...tight.map((s) => `${s.email} is ${s.status} (${s.percent_used}%).`),
          ...(byFree[0] && all.length > 1 ? [`${byFree[0].email} has the most room (${byFree[0].free} free).`] : []),
        ].join(" ");
        return text({
          message,
          accounts: rows,
          total: limited.length
            ? {
                used: human(sum((s) => s.bytes.used)),
                total: human(sum((s) => s.bytes.total!)),
                free: human(sum((s) => s.bytes.free!)),
                ...(limited.length < all.length ? { note: "Accounts with unlimited plans aren't in the total." } : {}),
              }
            : null,
          most_free_space: byFree[0] ? `${byFree[0].email} (${byFree[0].free} free)` : null,
          fullest: byUse[0] ? `${byUse[0].email} (${byUse[0].percent_used}% used)` : null,
          note: "Figures come from Google and can take a few hours to catch up after files move.",
        });
      } catch (e) {
        return failure(e);
      }
    }
  );

  server.registerTool(
    "find_files",
    {
      title: "Find files in your accounts",
      description:
        "Finds Drive files or folders and says which linked account each one is in (the account that owns it, whose storage it uses). " +
        "Leave account out to search every linked account at once: use that for \"where is my X?\" and for the biggest files overall. " +
        "Biggest first by default. Filter by kind, min_size_mb, name_contains or folder_id. moved_only lists the files (or, with kind=folders, " +
        "the folders) Offload moved "+
        "into an account, with where they came from and when (moved_here_from, moved_on); files inside a moved folder are covered by the folder. Returns IDs for transfer_files.",
      inputSchema: {
        account: emailArg("Search only this account. Leave out to search all of them."),
        kind: z
          .enum(["all", "images", "videos", "media", "documents", "folders"])
          .default("all")
          .describe("media = images and videos. documents = Google Docs, Sheets, Slides and other Google files."),
        min_size_mb: z.number().min(0).optional().describe("Only files at least this big, in MB."),
        name_contains: z.string().max(200).optional().describe("Matches whole words at the start of names, as Drive search does."),
        folder_id: z.string().optional().describe("Only items directly inside this folder."),
        moved_only: z.boolean().default(false).describe("Only items Offload moved here from another linked account."),
        sort: z.enum(["largest", "newest", "name"]).default("largest"),
        limit: z.number().int().min(1).max(100).default(25).describe("Per account."),
        page_token: z.string().optional().describe("next_page_token from a previous result. Needs account set to that result's account."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ account, moved_only, ...args }) => {
      try {
        if (args.page_token && !account) throw new Error("page_token belongs to one account: pass that account too.");
        const targets = account ? [find(account)] : accounts;
        const results = await Promise.all(
          targets.map((acct) => {
            const others = accounts.filter((x) => x.e !== acct.e).map((x) => x.e);
            return findFiles(acct, { ...args, moved_from: moved_only ? others : undefined });
          })
        );
        if (results.length === 1) return text(results[0]);
        const found = results.reduce((n, r) => n + r.count, 0);
        const filter = { ...args, moved_from: moved_only ? ["x"] : undefined };
        const where = results.filter((r) => r.count).map((r) => `${r.count} in ${r.account}${args.kind === "folders" ? "" : ` (${r.total_size})`}`);
        const empty = results.filter((r) => !r.count).map((r) => r.account);
        const message = found
          ? `Found ${describeFind(filter, found)}: ${listing(where)}.` + (empty.length ? ` Nothing in ${listing(empty)}.` : "") +
            (results.some((r) => r.next_page_token) ? " There are more; ask for the next page of an account to see them." : "")
          : `No ${describeFind(filter, 2).replace(/^2 /, "")} in any linked account.`;
        return text({
          message,
          searched: accounts.map((x) => x.e),
          note: "Each file is in exactly one account: the one that owns it. Results are per account.",
          results,
        });
      } catch (e) {
        return failure(e);
      }
    }
  );

  server.registerTool(
    "folder_size",
    {
      title: "Folder size",
      description:
        "Adds up the files an account owns inside a folder, subfolders included: the space moving that folder would free.",
      inputSchema: {
        folder_id: z.string(),
        account: emailArg(`Account the folder is in. Defaults to ${main.e}.`),
        continue_token: z.string().optional().describe("From a previous call on a big folder."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const acct = args.account ? find(args.account) : main;
        const prev = args.continue_token ? unpackCursor<SizeState>(args.continue_token, "size") : undefined;
        const { state, ...res } = await folderSize(acct, args.folder_id, prev);
        return text(state ? { ...res, continue_token: packCursor(state), note: "Big folder: call folder_size again with continue_token." } : res);
      } catch (e) {
        return failure(e);
      }
    }
  );

  const two = accounts.length === 2;
  server.registerTool(
    "transfer_files",
    {
      title: "Move files to another account",
      description:
        "Moves files and folders (with everything inside) from one linked account to another by transferring ownership: " +
        "the sending account requests it and the receiving account accepts it in the same step, so nothing else has to be done. " +
        "This frees the space in the sending account. Confirm with the person first. Big jobs run in steps: while done is false, " +
        "call again with only continue_token. Safe to repeat: items already moved are skipped.",
      inputSchema: {
        ids: z.array(z.string()).max(500).optional().describe("File and folder IDs from find_files. Not needed with continue_token."),
        from_account: emailArg(`Account the files move out of (the one being freed). Defaults to ${main.e}.`),
        to_account: emailArg(
          two
            ? "Account that receives the files. Defaults to the other linked account."
            : "Account that receives the files. Required: ask the person if they haven't said."
        ),
        continue_token: z.string().optional().describe("From a previous call that returned done: false. Remembers both accounts."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        let from: Account | undefined;
        let to: Account | undefined;
        if (!args.continue_token) {
          from = args.from_account ? find(args.from_account) : main;
          if (args.to_account) to = find(args.to_account);
          else if (two) to = accounts.find((x) => x.e !== from!.e);
          else {
            const options = accounts.filter((x) => x.e !== from!.e).map((x) => x.e).join(", ");
            throw new Error(`Which account should receive the files? Pass to_account: one of ${options}. get_accounts shows which has the most room.`);
          }
        }
        const prev = args.continue_token ? unpackCursor<TransferState>(args.continue_token, "transfer") : undefined;
        const { state, ...res } = await transfer(accounts, { ids: args.ids, from, to, state: prev, budgetMs: TRANSFER_BUDGET_MS });
        return text(state ? { ...res, continue_token: packCursor(state) } : res);
      } catch (e) {
        return failure(e);
      }
    }
  );

  /* ------------------------------ Photos ------------------------------ */

  const indexOf = (email: string) => accounts.indexOf(find(email));
  const token = (a: Account, _scope?: string, force?: boolean) => accessToken(a, !!force);
  const openPick = (t: string) => unpackCursor<PickToken>(t, "pick");
  const previewContent = (data: object, previews: Preview[]) => ({
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
      ...previews.map((p) => ({ type: "image" as const, data: p.data, mimeType: p.mime })),
    ],
  });

  server.registerTool(
    "photo_timeline",
    {
      title: "Photo and video timeline (Google Drive)",
      description:
        "Counts every photo and video stored in Google Drive, by year and by month (when each was taken, or else added): photos, videos, " +
        "space used, total video length, the cameras used, the busiest month and year, and a split by account. Leave account out to " +
        "cover every linked account. With group_by=month, each month comes with preview_ids for show_photos. Big libraries run in steps: " +
        "while done is false, call again with only continue_token. For the Google Photos library, use pick_google_photos instead.",
      inputSchema: {
        account: emailArg("Only this account. Leave out for all of them."),
        group_by: z.enum(["month", "year"]).default("month").describe("month also includes the year totals."),
        continue_token: z.string().optional().describe("From a previous call that returned done: false."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const prev = args.continue_token ? unpackCursor<DriveTimelineState & { g: "month" | "year"; ts: number[] }>(args.continue_token, "dtl") : undefined;
        const targets = prev?.ts || (args.account ? [indexOf(args.account)] : accounts.map((_, i) => i));
        const group_by = prev?.g || args.group_by;
        const st = await driveTimeline(accounts, targets, prev, PHOTOS_BUDGET_MS);
        const res = driveTimelineResult(st, accounts, targets, group_by);
        return text(res.done ? res : { ...res, continue_token: packCursor({ ...st, g: group_by, ts: targets }) });
      } catch (e) {
        return failure(e);
      }
    }
  );

  server.registerTool(
    "pick_google_photos",
    {
      title: "Pick photos from Google Photos",
      description:
        "Starts choosing photos from an account's Google Photos library. Google only lets apps see photos the person picks, so this " +
        "returns a picker_url: give it to the person as a link to open (in a browser signed in to that account), choose photos and videos " +
        "(up to 2,000) and press Done. Then wait for them to say they're done and call picked_photos with the photos_session.",
      inputSchema: {
        account: emailArg(`Whose Google Photos to pick from. Defaults to ${main.e}.`),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const idx = args.account ? indexOf(args.account) : 0;
        const { token: t, url } = await startPick(accounts, idx);
        return text({
          message: `Open this link to choose photos from ${accounts[idx].e}'s Google Photos, then press Done and tell me: ${url}`,
          picker_url: url,
          account: accounts[idx].e,
          photos_session: packCursor(t),
          note: "Ask the person to say when they've finished picking, then call picked_photos. The link works for a limited time.",
        });
      } catch (e) {
        return failure(e);
      }
    }
  );

  server.registerTool(
    "picked_photos",
    {
      title: "Timeline of picked Google Photos",
      description:
        "After the person has picked photos with pick_google_photos: a timeline of what they picked, by year and by month (photos, videos, " +
        "cameras, busiest month and year). If they haven't pressed Done yet, it says so: ask them to finish rather than calling again straight away.",
      inputSchema: {
        photos_session: z.string().describe("From pick_google_photos."),
        group_by: z.enum(["month", "year"]).default("month"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const t = openPick(args.photos_session);
        const r = await picked(accounts, t);
        if (!r.ready) {
          return text({
            message: `Nothing picked yet: open the link from pick_google_photos, choose photos in ${accounts[t.a].e}'s Google Photos and press Done, then tell me.`,
            ready: false,
          });
        }
        return text({ ready: true, ...pickedResult(r.items, accounts, t.a, args.group_by) });
      } catch (e) {
        return failure(e);
      }
    }
  );

  server.registerTool(
    "show_photos",
    {
      title: "Show photos",
      description:
        `Shows up to ${MAX_PREVIEWS} small previews in the chat, as images you can see and describe. Either pass ids (Drive photos or videos: ` +
        "preview_ids from photo_timeline, or IDs from find_files with kind=media), or a photos_session from pick_google_photos with an " +
        "optional period (a year like 2019 or a month like 2019-07). Videos show a still frame.",
      inputSchema: {
        ids: z.array(z.string()).max(MAX_PREVIEWS).optional().describe("Drive file IDs."),
        photos_session: z.string().optional().describe("From pick_google_photos, for picked Google Photos."),
        period: z
          .string()
          .regex(/^\d{4}(-\d{2})?$/)
          .optional()
          .describe("With photos_session: only items taken in this year (2019) or month (2019-07)."),
        limit: z.number().int().min(1).max(MAX_PREVIEWS).default(8),
        offset: z.number().int().min(0).default(0).describe("With photos_session: skip this many, to see the next ones."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        if (args.photos_session) {
          const t = openPick(args.photos_session);
          const r = await picked(accounts, t);
          if (!r.ready) return text({ message: "Nothing picked yet: ask the person to finish picking and press Done.", ready: false });
          const match = inPeriod(r.items, args.period);
          const slice = match.slice(args.offset, args.offset + args.limit);
          const previews = await pickedPreviews(accounts[t.a], slice, token);
          const shown = args.offset + slice.length;
          const message = !match.length
            ? `No picked photos ${args.period ? `from ${args.period}` : ""}.`.replace(" .", ".")
            : `Showing ${count(previews.length, "preview")} of ${count(match.length, "picked item")}` +
              (args.period ? ` from ${args.period}` : "") + (shown < match.length ? `; pass offset ${shown} for the next ones.` : ".");
          return previewContent(
            {
              message,
              previews: previews.map((p, i) => ({ n: i + 1, name: p.name, taken: p.taken, video: p.video })),
              ...(shown < match.length ? { next_offset: shown } : {}),
            },
            previews
          );
        }
        if (!args.ids?.length) throw new Error("Pass ids (Drive file IDs) or a photos_session.");
        const { previews, missing } = await drivePreviews(accounts, args.ids.slice(0, args.limit), (a) => token(a));
        const message =
          `Showing ${count(previews.length, "preview")}.` +
          (missing.length ? ` ${count(missing.length, "item")} had no preview or couldn't be found.` : "");
        return previewContent(
          { message, previews: previews.map((p, i) => ({ n: i + 1, name: p.name, taken: p.taken, account: p.account, video: p.video })) },
          previews
        );
      } catch (e) {
        return failure(e);
      }
    }
  );

  server.registerTool(
    "copy_google_photos",
    {
      title: "Copy picked Google Photos to another account",
      description:
        "Copies the photos and videos picked with pick_google_photos into another linked account's Google Photos, in original quality, " +
        "into an album \"Copied from <account>\". Google Photos has no ownership transfer, so this is a copy: the originals stay until the " +
        "person deletes them, and the copies use the receiving account's storage. Confirm with the person first. Big jobs run in steps: " +
        "while done is false, call again with only continue_token.",
      inputSchema: {
        photos_session: z.string().optional().describe("From pick_google_photos. Not needed with continue_token."),
        to_account: emailArg(
          two ? "Account that receives the copies. Defaults to the other linked account." : "Account that receives the copies. Required: ask the person if they haven't said."
        ),
        continue_token: z.string().optional().describe("From a previous call that returned done: false."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        let st: CopyState;
        if (args.continue_token) st = unpackCursor<CopyState>(args.continue_token, "pcopy");
        else {
          if (!args.photos_session) throw new Error("Pass the photos_session from pick_google_photos.");
          const t = openPick(args.photos_session);
          let to: number;
          if (args.to_account) to = indexOf(args.to_account);
          else if (two) to = t.a === 0 ? 1 : 0;
          else {
            const options = accounts.filter((_, i) => i !== t.a).map((x) => x.e).join(", ");
            throw new Error(`Which account should receive the copies? Pass to_account: one of ${options}. get_accounts shows which has the most room.`);
          }
          if (to === t.a) throw new Error("Pick a different account to copy to: that's the one the photos are in.");
          const r = await picked(accounts, t);
          if (!r.ready) return text({ message: "Nothing picked yet: ask the person to finish picking and press Done.", done: false });
          st = { k: "pcopy", a: t.a, to, id: t.id, next: 0, open: [], album: null, total: r.items.length, copied: 0, failed: 0, bytes: 0, errors: [] };
        }
        const { done, message } = await copyPickedServer(accounts, st, PHOTOS_BUDGET_MS, token);
        const res = copyResult(st, accounts, done, message);
        return text(done ? res : { ...res, continue_token: packCursor(st) });
      } catch (e) {
        return failure(e);
      }
    }
  );

  return server;
}
