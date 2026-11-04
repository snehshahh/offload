import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { count, describeFind, findFiles, folderSize, human, listing, storage, transfer } from "./drive";
import type { Account } from "./google";

/** How long one transfer_files call works before handing back a continue_token. */
const TRANSFER_BUDGET_MS = 40_000;

const INSTRUCTIONS = `Every result starts with "message": a plain summary you can pass on to the person as it is, adding detail from the rest of the result where it helps.

Offload moves Google Drive files between the person's own Google accounts (2 to 5 of them, linked when the connector was added) by transferring ownership, which frees storage in the account they leave. The first linked account is their main account.

Storage: get_accounts returns every account's storage. Show it as a small table (account, used, total, free, % used, status) followed by one line on which account has the most room. Google can take a few hours to update these numbers after a move.

Finding things: call find_files without account to search every linked account at once; each result group says which account holds those files (the owner, whose storage they use). Files Offload moved are tagged with where they came from and when (moved_here_from, moved_on); find_files with moved_only lists them.

Moving: get_accounts → find_files / folder_size to pick what to move → confirm with the person, listing what will move, how much space it frees, and which account receives it → transfer_files. With more than two accounts, ask which account should receive the files unless the person said so; get_accounts shows which has the most room. If transfer_files returns done: false, call it again with only continue_token until done is true, and tell the person how far it's got.

Only files the sending account owns can be moved; files owned by anyone else are skipped. Moved items keep their folder structure; loose ones land in "Transferred from <sender>" in the receiving account's My Drive. A transfer can be undone by moving the items back. Nothing is deleted.`;

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function failure(e: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] };
}

export function buildServer(accounts: Account[]): McpServer {
  const server = new McpServer({ name: "offload", title: "Offload", version: "1.1.0" }, { instructions: INSTRUCTIONS });
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
        "Biggest first by default. Filter by kind, min_size_mb, name_contains or folder_id. moved_only lists what Offload moved " +
        "into an account, with where it came from and when (moved_here_from, moved_on). Returns IDs for transfer_files.",
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
        return text(await folderSize(acct, args.folder_id, args.continue_token));
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
        return text(await transfer(accounts, { ids: args.ids, from, to, cursor: args.continue_token, budgetMs: TRANSFER_BUDGET_MS }));
      } catch (e) {
        return failure(e);
      }
    }
  );

  return server;
}
