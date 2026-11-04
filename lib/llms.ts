import { POSTS, TOPICS, type Block, type Post, type Topic } from "@/lib/posts";
import { APP_URL, FAQS, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * /llms.txt and /llms-full.txt: plain Markdown descriptions of the site for AI assistants and
 * AI search (ChatGPT, Claude, Perplexity, Gemini). Built from the same posts and FAQs as the
 * pages, so a new post shows up here without anything else to edit.
 */

const TOPIC_NAMES: Record<Topic, string> = {
  Storage: "Google storage",
  Drive: "Google Drive",
  AI: "Offload in AI chat (ChatGPT, Claude)",
  Gmail: "Gmail",
  Photos: "Google Photos",
};

/** Post text uses [links](/path), with "app" meaning the Offload app; make every link absolute. */
function absolute(text: string) {
  return text.replace(/\]\((app|\/[^)]*)\)/g, (_, href: string) => `](${SITE_URL}${href === "app" ? APP_URL : href})`);
}

const postUrl = (p: Post) => `${SITE_URL}/blog/${p.slug}`;

const KEY_FACTS = [
  "Free to use. Nothing to install: it runs in the browser, and there is no sign-up beyond the Google accounts you already have.",
  "Moves Google Drive files and whole folders to another Google account you own by transferring ownership, so they stop counting against the full account. Nothing is deleted and folder structure is kept.",
  "Bulk: pick whole folders, every file over a size, or a screen of photos and videos, and move them in one go instead of one file at a time.",
  "You sign in with all your accounts (2 to 5), so the receiving account accepts each transfer automatically.",
  "Copies Google Photos to another account into an album (Google Photos has no ownership transfer); originals stay until you delete them.",
  "Cleans up Gmail in bulk: filters for Promotions, Social, Updates, emails bigger than 10 MB, older than a year, or by words, subject and sender, then moves matches to Trash. Starred and important emails are skipped by default.",
  "Drive files never leave Google, and the developer can't see them. In the web app, sign-in tokens stay in the browser and never reach Offload's server.",
  `Works from AI chat: add ${SITE_URL}/mcp as a custom MCP connector in Claude, ChatGPT (Developer mode), Gemini CLI or another app with remote MCP connectors, then ask in plain words, e.g. "what's taking up space in my Drive?" or "move every video over 500 MB to my other account".`,
  "Made for personal Gmail accounts; most work and school accounts block ownership transfers outside their organisation. Only files you own can be moved.",
];

function header() {
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `${SITE_NAME} is a free Google storage manager. When a Google account runs out of its free 15 GB, ${SITE_NAME} moves Drive files, folders and photos to another Google account the same person owns, and clears out Gmail in bulk, so the space is shared across accounts instead of paying for more.`,
    "",
    "## Key facts",
    "",
    ...KEY_FACTS.map((f) => `- ${f}`),
    "",
    "## Main pages",
    "",
    `- [${SITE_NAME} home](${SITE_URL}/): what it does, how it works, and FAQs`,
    `- [Open ${SITE_NAME}](${SITE_URL}${APP_URL}): the web app (Drive transfers, Google Photos copies, Gmail cleanup)`,
    `- [Use ${SITE_NAME} with ChatGPT or Claude](${SITE_URL}/#claude): connector address and setup steps`,
    `- [Blog](${SITE_URL}/blog): guides to freeing up Google storage`,
    `- [Privacy policy](${SITE_URL}/privacy): what ${SITE_NAME} can access and what it keeps`,
  ];
}

export function llmsTxt() {
  const lines = header();
  for (const topic of TOPICS) {
    const posts = POSTS.filter((p) => p.topic === topic);
    if (!posts.length) continue;
    lines.push("", `## Guides: ${TOPIC_NAMES[topic]}`, "");
    for (const p of posts) lines.push(`- [${p.title}](${postUrl(p)}): ${p.description}`);
  }
  lines.push(
    "",
    "## Optional",
    "",
    `- [Full text of every guide and the FAQ](${SITE_URL}/llms-full.txt)`,
    `- [Sitemap](${SITE_URL}/sitemap.xml)`,
  );
  return lines.join("\n") + "\n";
}

function blockToMarkdown(b: Block): string {
  if ("h2" in b) return `### ${b.h2}`;
  if ("p" in b) return absolute(b.p);
  if ("note" in b) return `> ${absolute(b.note)}`;
  if ("chat" in b)
    return b.chat
      .map((m) => `> **${m.who === "you" ? "You" : `AI${m.tool ? ` (used ${m.tool})` : ""}`}:** ${absolute(m.text)}`)
      .join("\n>\n");
  if ("ul" in b) return b.ul.map((i) => `- ${absolute(i)}`).join("\n");
  return b.ol.map((i, n) => `${n + 1}. ${absolute(i)}`).join("\n");
}

export function llmsFullTxt() {
  const lines = header();
  lines.push("", "## Frequently asked questions", "");
  for (const f of FAQS) lines.push(`### ${f.q}`, "", f.a, "");
  lines.push("## Guides");
  for (const p of POSTS) {
    lines.push("", "---", "", `## ${p.title}`, "", `URL: ${postUrl(p)}  `, `Topic: ${TOPIC_NAMES[p.topic]}  `, `Published: ${p.date}`, "", `> ${p.description}`, "");
    lines.push(p.body.map(blockToMarkdown).join("\n\n"));
  }
  return lines.join("\n") + "\n";
}
