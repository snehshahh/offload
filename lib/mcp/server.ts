import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles, folderSize, storage, transfer } from "./drive";
import type { Account } from "./google";

/** How long one transfer_files call works before handing back a continue_token. */
const TRANSFER_BUDGET_MS = 40_000;

export type Linked = { a: Account; b: Account };

const INSTRUCTIONS = `Offload moves Google Drive files between the person's two Google accounts by transferring ownership, which frees storage in the account they leave. Both accounts were linked when the connector was added; get_accounts shows them.

Typical flow: get_accounts (storage of both) → find_files / folder_size to pick what to move → confirm with the person, listing what will move, how much space it frees, and which account it goes to → transfer_files. If transfer_files returns done: false, call it again with only continue_token until done is true, and tell the person how far it's got.

Only files the sending account owns can be moved; files owned by anyone else are skipped. Moved items keep their folder structure; loose ones land in "Transferred from <sender>" in the receiving account's My Drive. A transfer can be undone by transferring back with from_account set to the other account. Nothing is deleted. Google can take a few hours to update storage numbers.`;

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function failure(e: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] };
}

export function buildServer(linked: Linked): McpServer {
  const server = new McpServer({ name: "offload", title: "Offload", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  const pick = (email: string | undefined): "a" | "b" => {
    if (!email) return "a";
    const e = email.trim().toLowerCase();
    if (e === linked.a.e) return "a";
    if (e === linked.b.e) return "b";
    throw new Error(`${email} isn't linked. The linked accounts are ${linked.a.e} and ${linked.b.e}.`);
  };
  const accountArg = z
    .string()
    .optional()
    .describe(`Email of one of the two linked accounts. Defaults to ${linked.a.e}.`);

  server.registerTool(
    "get_accounts",
    {
      title: "Linked accounts and storage",
      description:
        "Shows the two linked Google accounts and how much storage each is using, so you can tell which one is full and how much the other can take.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const [a, b] = await Promise.all([storage(linked.a), storage(linked.b)]);
        return text({ default_sender: a, other_account: b });
      } catch (e) {
        return failure(e);
      }
    }
  );

  server.registerTool(
    "find_files",
    {
      title: "Find files to move",
      description:
        "Lists Drive files or folders owned by one of the linked accounts, biggest first by default. Use it to find what's taking up space " +
        "(e.g. kind=videos, or min_size_mb=100), to look inside a folder (folder_id), or to search by name. Returns IDs for transfer_files.",
      inputSchema: {
        account: accountArg,
        kind: z
          .enum(["all", "images", "videos", "media", "documents", "folders"])
          .default("all")
          .describe("media = images and videos. documents = Google Docs, Sheets, Slides and other Google files."),
        min_size_mb: z.number().min(0).optional().describe("Only files at least this big, in MB."),
        name_contains: z.string().max(200).optional(),
        folder_id: z.string().optional().describe("Only items directly inside this folder."),
        sort: z.enum(["largest", "newest", "name"]).default("largest"),
        limit: z.number().int().min(1).max(100).default(25),
        page_token: z.string().optional().describe("next_page_token from a previous call, for more results."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const acct = linked[pick(args.account)];
        return text(await findFiles(acct, args));
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
        account: accountArg,
        continue_token: z.string().optional().describe("From a previous call on a big folder."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return text(await folderSize(linked[pick(args.account)], args.folder_id, args.continue_token));
      } catch (e) {
        return failure(e);
      }
    }
  );

  server.registerTool(
    "transfer_files",
    {
      title: "Move files to the other account",
      description:
        "Moves files and folders (with everything inside) from one linked account to the other by transferring ownership: " +
        "the sending account requests it and the receiving account accepts it in the same step, so nothing else has to be done. " +
        "This frees the space in the sending account. Confirm with the person first. Big jobs run in steps: while done is false, " +
        "call again with only continue_token. Safe to repeat: items already moved are skipped.",
      inputSchema: {
        ids: z.array(z.string()).max(500).optional().describe("File and folder IDs from find_files. Not needed with continue_token."),
        from_account: accountArg.describe(
          `Account the files move out of (the one being freed). The other linked account receives them. Defaults to ${linked.a.e}.`
        ),
        continue_token: z.string().optional().describe("From a previous call that returned done: false."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const result = await transfer(linked, {
          ids: args.ids,
          from: pick(args.from_account),
          cursor: args.continue_token,
          budgetMs: TRANSFER_BUDGET_MS,
        });
        return text(result);
      } catch (e) {
        return failure(e);
      }
    }
  );

  return server;
}
