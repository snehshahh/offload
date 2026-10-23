/**
 * Blog posts. Body text supports [links](/path), **bold** and `code`; a link to "app" opens Offload.
 */
export type Block =
  | { h2: string }
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { note: string };

export type Topic = "Storage" | "Drive" | "Gmail" | "Photos";

export type Post = {
  slug: string;
  title: string;
  description: string;
  topic: Topic;
  date: string;
  keywords: string[];
  body: Block[];
};

export const POSTS: Post[] = [
  {
    slug: "google-storage-full",
    title: "Google storage full? How to free up space without paying",
    description:
      "Your free 15 GB is shared by Google Drive, Gmail and Google Photos. Here’s where the space actually goes, and the quickest free ways to get it back.",
    topic: "Storage",
    date: "2026-10-23",
    keywords: ["Google storage full", "free up Google storage", "Google account storage full", "free Google storage manager"],
    body: [
      { p: "Every free Google account gets 15 GB, and that one allowance is shared by Google Drive, Gmail and Google Photos. When it runs out, Drive stops taking uploads, Photos stops backing up, and Gmail eventually can’t send or receive email. Before you pay for more, it’s worth knowing that most full accounts can be cleared in an afternoon." },
      { h2: "First, see where the space went" },
      { p: "Open **one.google.com/storage**. It splits your usage into Drive, Gmail and Photos, so you know which one to start with. In Google Drive, the **Storage** link in the left sidebar lists every file you own, biggest first." },
      { p: "Usually one service dominates. Videos and old backups fill Drive, years of newsletters and attachments fill Gmail, and phone videos fill Photos." },
      { h2: "1. Move big files to another Google account you own" },
      { p: "If you have a second Google account, it has its own 15 GB. Handing files over to it frees space without deleting anything. Google Drive lets you transfer ownership of a file to another personal account, and once that account accepts, the file counts against its storage instead of yours." },
      { p: "Doing that one file at a time is slow, which is what [Offload](app) is for: pick whole folders, everything over 100 MB, or a screen of photos, and send them all at once. Read [how to move Google Drive files to another account](/blog/move-google-drive-files-to-another-account) for the full walkthrough." },
      { h2: "2. Clear out Gmail in bulk" },
      { p: "Promotions, social notifications and emails with large attachments add up over the years. Gmail’s search can find them in seconds: `category:promotions`, `larger:10M` and `older_than:1y` are good starting points. [Our Gmail cleanup guide](/blog/gmail-storage-full) walks through the safest order to do it in." },
      { h2: "3. Empty the trash, in every service" },
      { p: "Deleted files still count until the trash is emptied. Drive and Gmail keep trashed items for 30 days, and Google Photos keeps them for 60. If you need the space now, empty each trash yourself. Gmail’s Spam folder counts too." },
      { h2: "4. Check backups you forgot about" },
      { p: "Android phone backups live in your Google storage, and WhatsApp chat backups on Android count against it as well. If you’ve changed phones, old device backups may still be there. You can see and delete them from the storage page in Google One." },
      { h2: "5. Look at Google Photos’ largest items" },
      { p: "A few minutes of 4K video can take more space than thousands of photos. Sort by what’s biggest and either delete what you don’t need or [copy them to your other account](/blog/move-google-photos-to-another-account) first." },
      { h2: "6. Remember what doesn’t count" },
      { p: "Files other people shared with you don’t use your storage; only files you own do. So there’s no need to remove things from **Shared with me** to free space." },
      { note: "Freed space can take up to a day to show up in Google’s storage figures. If the number hasn’t moved, give it a few hours before trying anything else. [Here’s what else can keep storage full](/blog/google-storage-still-full-after-deleting)." },
    ],
  },
  {
    slug: "move-google-drive-files-to-another-account",
    title: "How to move Google Drive files to another Google account",
    description:
      "Three ways to move Drive files between your Google accounts, from download-and-reupload to transferring ownership in bulk, and which one keeps your folders, links and history intact.",
    topic: "Drive",
    date: "2026-10-23",
    keywords: ["move Google Drive files to another account", "transfer Google Drive to another account", "bulk move Google Drive files", "migrate Google Drive between accounts"],
    body: [
      { p: "Maybe one account is full and the other is empty. Maybe you’re moving off an old address. Either way, there are three ways to get files from one Google Drive to another, and they’re not equally good." },
      { h2: "Option 1: Download and re-upload" },
      { p: "Download everything from the first account (or use Google Takeout), then upload it into the second. It works, but it’s slow for anything large, Google Docs, Sheets and Slides get converted to Office files on the way, and every share link, comment and version history is lost." },
      { h2: "Option 2: Share, then make a copy" },
      { p: "Share files with the other account, then use **Make a copy** there. Copies keep Google Docs as Google Docs, but Drive can’t copy folders, the copies get new links, and both accounts end up storing the same file until you delete the originals." },
      { h2: "Option 3: Transfer ownership (the best one)" },
      { p: "Google Drive lets a personal account hand ownership of a file to another personal account. Nothing is copied: the same file simply changes owner. Links keep working, comments and version history stay, and the file starts counting against the new owner’s storage as soon as they accept." },
      { p: "To do it by hand in Drive:" },
      { ol: [
        "Right-click the file and choose **Share**.",
        "Add your other account as an editor and send.",
        "Open Share again, click the role next to the other account, and pick **Transfer ownership**.",
        "Sign in to the other account and accept the request from the email Google sends, or from Drive.",
      ] },
      { p: "The catch is scale. Transferring a folder only transfers the folder itself, not the files inside it, so moving a real collection of files this way means repeating those steps for every single file." },
      { h2: "Transfer ownership in bulk with Offload" },
      { p: "[Offload](app) does the same ownership transfer for you, thousands of files at a time:" },
      { ol: [
        "Open Offload signed in to the account that’s full.",
        "Pick what to move from the **Folders**, **Large files** or **Photos in Drive** tabs. Every folder shows its size.",
        "Type the Gmail address of your other account and send. Offload requests the transfer for every file and subfolder.",
        "Open Offload as the other account, go to **Waiting for you**, and accept everything at once.",
      ] },
      { p: "Your folder structure is kept. Loose files are tidied into a folder named “Transferred from” plus the address they came from, so nothing gets lost in the root of the new Drive." },
      { h2: "Things to know first" },
      { ul: [
        "It’s for personal Google accounts. Work and school accounts usually block transfers outside their organisation.",
        "You can only transfer files you own. Files someone shared with you stay with their owner, and Offload lists them so you know.",
        "The other account must accept. Until it does, the files still count against the first account.",
        "Google sends one email per file to the receiving account. Offload leaves that notification off unless you ask for it.",
      ] },
      { note: "Try it on one small folder first. Once you’ve seen a transfer go through, moving the rest takes a couple of clicks." },
    ],
  },
  {
    slug: "transfer-ownership-google-drive-folder",
    title: "How to transfer ownership of a whole Google Drive folder",
    description:
      "In Google Drive, transferring a folder doesn’t transfer the files inside it. Here’s how to hand over a folder with every subfolder and file in one go.",
    topic: "Drive",
    date: "2026-10-23",
    keywords: ["transfer ownership Google Drive folder", "transfer ownership of folder and subfolders", "Google Drive change owner folder", "transfer ownership Google Drive in bulk"],
    body: [
      { p: "It’s one of Google Drive’s more surprising rules: when you transfer ownership of a folder, only the folder changes owner. Every file and subfolder inside it stays with you, and keeps using your storage." },
      { p: "So if you hand a 40 GB “Videos” folder to your other account through Drive’s share menu, the other account owns an empty-looking container and you still own the 40 GB." },
      { h2: "Doing it by hand" },
      { p: "To move a folder properly in Drive itself, you have to transfer ownership of every item inside it as well. You can select several files in one folder and change the owner together, but you have to open each subfolder and repeat, and the other account has to accept every one." },
      { p: "For a folder with a few files, that’s fine. For years of photos or projects, it isn’t." },
      { h2: "Hand over the whole tree with Offload" },
      { p: "[Offload](app) walks the folder for you. On the **Folders** tab, tick any folder and it requests ownership transfer for the folder, every subfolder and every file inside, however deep it goes. The folder’s total size is shown next to it, so you know how much space you’ll get back before you send." },
      { ol: [
        "Open Offload as the account that owns the folder.",
        "Tick the folders on the Folders tab. You can mix folders from different places.",
        "Enter your other account’s address and send.",
        "Open Offload as the other account and accept everything under **Waiting for you**.",
      ] },
      { p: "When the other account accepts, the folder arrives with the same structure it had before. Links to files keep working, because they’re still the same files." },
      { h2: "What gets skipped" },
      { ul: [
        "Files inside the folder that someone else owns. Only their owner can transfer them, and Offload tells you which ones they are.",
        "Shortcuts point at files elsewhere, so the files themselves stay where they are.",
      ] },
      { note: "Large folders can take a while to process. Offload works through them in batches and shows progress; keep the tab open until it’s done." },
    ],
  },
  {
    slug: "find-largest-files-google-drive",
    title: "How to find the largest files in Google Drive",
    description:
      "A handful of files usually take up most of your Google Drive. Here’s how to find them, sorted biggest first, and what to do with them.",
    topic: "Drive",
    date: "2026-10-23",
    keywords: ["find large files Google Drive", "Google Drive largest files", "Google Drive sort by size", "what is taking up space in Google Drive"],
    body: [
      { p: "Storage tends to follow a simple rule: a small number of files take up most of the space. Find those and you’ve found most of the fix." },
      { h2: "In Google Drive" },
      { p: "In Drive on the web, click **Storage** in the left sidebar (under the storage meter). It lists every file you own, sorted by how much storage it uses, biggest first. Folders don’t appear there, only files." },
      { p: "Typical culprits:" },
      { ul: [
        "Videos, especially phone footage and screen recordings.",
        "Zip files and old backups you uploaded once and forgot.",
        "Disk images, raw photos and design files.",
        "Old copies of the same large file in different folders.",
      ] },
      { p: "Google Docs, Sheets and Slides rarely matter: even long documents are small." },
      { h2: "In Offload" },
      { p: "[Offload](app)’s **Large files** tab lists everything you own over 50, 100, 250 or 500 MB, biggest first, with the total size of whatever you’ve ticked. The **Folders** tab shows the size of every folder too, which Drive itself doesn’t do, so you can spot the one folder that’s eating 20 GB." },
      { p: "From either tab you can send the files straight to your other Google account in bulk." },
      { h2: "Then decide: delete, or move" },
      { p: "Delete what you genuinely don’t need, and remember to empty the trash afterwards. For anything you want to keep, [moving it to another account you own](/blog/move-google-drive-files-to-another-account) frees the space without losing the file." },
      { note: "Drive counts the storage a file uses, which for a few file types can differ from its size on disk. Offload shows the figure Google counts against you." },
    ],
  },
  {
    slug: "two-google-accounts-free-storage",
    title: "Two free Google accounts, 30 GB: how to split your storage",
    description:
      "A second free Google account doubles your storage. Here’s a simple way to split files between a daily account and an archive account, and keep it tidy.",
    topic: "Storage",
    date: "2026-10-23",
    keywords: ["free Google storage", "two Google accounts storage", "manage Google storage across accounts", "Google storage manager free"],
    body: [
      { p: "Each personal Google account comes with 15 GB of free storage. If you already have two accounts, you have 30 GB, but probably one is full and the other is nearly empty. Splitting files sensibly between them is often enough to avoid paying for more." },
      { h2: "Pick a role for each account" },
      { p: "The simplest setup is a **daily account** and an **archive account**:" },
      { ul: [
        "The daily account is the one on your phone and in your email. It keeps what you use now: current projects, recent photos, active email.",
        "The archive account keeps what you want to keep but rarely open: finished projects, old videos, past years’ photos, scanned documents.",
      ] },
      { h2: "What to move to the archive" },
      { ul: [
        "Folders for finished projects, school years or old jobs.",
        "Large videos you want to keep but don’t watch often.",
        "Photo and video archives from previous years.",
        "Backups and exports you might need one day.",
      ] },
      { p: "[Offload](app) moves these by transferring ownership, so nothing is downloaded or re-uploaded and the folder structure stays. [Here’s how it works](/blog/move-google-drive-files-to-another-account)." },
      { h2: "Keep both accounts reachable" },
      { p: "Keep the archive account signed in on one browser profile, or add it to your phone’s account list so you can find a file quickly. Sharing the archive’s top folder back to your daily account as a viewer lets you browse it without switching accounts, and shared files don’t use the daily account’s storage." },
      { h2: "Sign in to the archive now and then" },
      { p: "Google may delete personal accounts that haven’t been used for two years. Signing in to the archive account occasionally keeps it active." },
      { h2: "Don’t forget Gmail and Photos" },
      { p: "The same 15 GB covers Gmail and Google Photos. A [quick Gmail cleanup](/blog/gmail-storage-full) and [copying old photos to the archive](/blog/move-google-photos-to-another-account) can free as much as moving Drive files." },
    ],
  },
  {
    slug: "move-google-photos-to-another-account",
    title: "How to move Google Photos to another Google account",
    description:
      "Google Photos can’t transfer ownership, but you can copy photos and videos to another account and then delete the originals. Three ways to do it.",
    topic: "Photos",
    date: "2026-10-23",
    keywords: ["move Google Photos to another account", "transfer Google Photos to another account", "copy Google Photos between accounts", "Google Photos storage full"],
    body: [
      { p: "Unlike Drive, Google Photos has no way to hand a photo to another account. Every method is really a copy: the photo is added to the other account, and the space frees up only when you delete the original. Here are the options." },
      { h2: "Partner sharing" },
      { p: "In Google Photos settings, **Partner sharing** lets you share your library, or photos of certain people, with one other account. That account can choose to save the shared photos to its own library. It’s designed for couples sharing family photos, so it works best going forward rather than for moving a back catalogue, and it’s limited to one partner." },
      { h2: "Google Takeout, then upload" },
      { p: "Export your photos with Google Takeout, download the archive and upload it to the other account. It handles any amount, but it means downloading everything to a computer first, and albums and descriptions don’t come across neatly." },
      { h2: "Copy them directly with Offload" },
      { p: "[Offload](app)’s **Google Photos** tab copies photos and videos you pick straight into your other account’s Google Photos, without going through your computer:" },
      { ol: [
        "Connect your other account once. It only grants permission to add photos, and can’t see or change anything already there.",
        "Pick photos in Google’s own photo picker, up to 2,000 at a time.",
        "Offload copies each one and gathers them in an album called “Copied from” plus your address.",
        "Check the copies in the other account, then delete the originals.",
      ] },
      { p: "Copies are uploaded in original quality, and they count against the other account’s storage." },
      { h2: "Deleting the originals" },
      { p: "Deleted photos sit in Google Photos’ trash for 60 days and still count against your storage until then. Empty the trash once you’re sure the copies are safe." },
      { note: "Photos stored in Google Drive are different from photos in the Google Photos app. For images and videos in Drive, use Offload’s **Photos in Drive** tab, which transfers ownership instead of copying." },
      { h2: "Limits" },
      { ul: [
        "Keep the browser tab open while it copies.",
        "Some very large videos may not copy, if Google won’t send them in pieces.",
        "If several Google accounts are signed in to the same browser, connect the second account from a browser where the account you copy from is the default one.",
      ] },
    ],
  },
  {
    slug: "gmail-storage-full",
    title: "Gmail storage full? How to clean up your inbox fast",
    description:
      "Gmail shares your 15 GB with Drive and Photos. Here’s the order to clean it up in, the searches that find the most space, and how to trash thousands of emails at once.",
    topic: "Gmail",
    date: "2026-10-23",
    keywords: ["Gmail storage full", "clean up Gmail", "Gmail cleanup tool", "free up Gmail storage", "bulk delete Gmail"],
    body: [
      { p: "When your Google storage fills up, Gmail is often a big part of it: years of newsletters, notifications and attachments. Once you’re over the limit, Gmail stops sending and receiving, so it’s worth clearing before that happens." },
      { h2: "Start with the biggest emails" },
      { p: "A few emails with large attachments can outweigh thousands of plain ones. Search Gmail for `larger:10M` to see every email over 10 MB. Save any attachments you want to keep to Drive first, then delete the rest. [More on finding large emails](/blog/find-delete-large-emails-gmail)." },
      { h2: "Then the categories you never read" },
      { p: "Gmail sorts most bulk mail into Promotions, Social and Updates. These are usually safe to clear, especially the older ones:" },
      { ul: [
        "`category:promotions older_than:6m`",
        "`category:social older_than:1y`",
        "`category:updates older_than:1y`",
      ] },
      { p: "[How to delete every Promotions email at once](/blog/delete-all-promotions-gmail)." },
      { h2: "Then specific senders" },
      { p: "Shops, apps and newsletters you’ve stopped caring about: search `from:(example.com)` to find everything from one sender, then unsubscribe and delete in one go." },
      { h2: "Trash thousands at once" },
      { p: "Gmail on the web can select every matching conversation, but it’s easy to sweep up starred or important emails with them. [Offload](app)’s **Gmail** tab builds the search for you from quick filters (Promotions, Social, Updates, bigger than 10 MB, has attachments, older than a year) plus words, subject and sender. It shows how many emails match and the newest 20 as you type, then moves them to Trash in batches after you confirm." },
      { p: "Starred and important emails are left alone by default, and it never trashes more than the number you confirmed." },
      { h2: "Empty the Trash and Spam" },
      { p: "Trashed emails still count until they’re gone. Gmail empties Trash after 30 days; empty it yourself for the space now, and clear Spam while you’re there." },
      { note: "Gmail’s storage figure can take a while to update after a big cleanup. If it hasn’t moved, check again later in the day." },
    ],
  },
  {
    slug: "delete-all-promotions-gmail",
    title: "How to delete all Promotions emails in Gmail at once",
    description:
      "Clear thousands of Promotions emails in a couple of minutes, in Gmail itself or with Offload, without losing starred or important mail.",
    topic: "Gmail",
    date: "2026-10-23",
    keywords: ["delete all promotions Gmail", "delete promotions in bulk", "bulk delete Gmail emails", "clear Gmail promotions tab"],
    body: [
      { p: "The Promotions tab is where Gmail puts marketing email, and for most people it’s the biggest pile in the inbox. Clearing it is quick once you know where the “select all” button hides." },
      { h2: "In Gmail on the web" },
      { ol: [
        "Open the **Promotions** tab, or search `category:promotions`.",
        "Tick the checkbox at the top left to select the visible page.",
        "Click **Select all conversations that match this search** in the banner that appears.",
        "Click the bin icon and confirm.",
      ] },
      { p: "On a large mailbox, Gmail can take a while to process this, and it applies to everything that matches, including emails you starred." },
      { h2: "Keep the ones that matter" },
      { p: "Add a few words to the search to protect what you want to keep, or narrow it to older emails:" },
      { ul: [
        "`category:promotions -is:starred -is:important` skips starred and important emails.",
        "`category:promotions older_than:3m` keeps the last three months, in case a voucher is still valid.",
        "`category:promotions -from:(yourbank.com)` keeps one sender.",
      ] },
      { h2: "With Offload" },
      { p: "In [Offload](app)’s **Gmail** tab, tick **Promotions**, optionally **Older than a year**, and see how many emails match before anything happens. Starred and important emails are excluded by default. Confirm, and Offload moves them to Trash in batches, showing progress as it goes." },
      { h2: "Stop them coming back" },
      { p: "Deleting old promotions is half the job. Open a recent email from each sender you don’t want and use Gmail’s **Unsubscribe** link next to the sender’s name. For the rest, a [Gmail filter](/blog/create-gmail-labels) can label or archive them automatically." },
      { note: "Everything goes to Trash, not straight to deletion, so you have 30 days to restore anything you trashed by mistake." },
    ],
  },
  {
    slug: "find-delete-large-emails-gmail",
    title: "How to find and delete large emails in Gmail",
    description:
      "Search Gmail by size to find the emails with big attachments, save the files you need, and free up gigabytes of storage.",
    topic: "Gmail",
    date: "2026-10-23",
    keywords: ["find large emails Gmail", "Gmail search by size", "delete large emails Gmail", "Gmail attachments taking up space"],
    body: [
      { p: "Most emails are tiny. The ones that fill your storage carry attachments: videos, photo sets, PDFs and presentations. Gmail can search by size, so finding them takes seconds." },
      { h2: "Search by size" },
      { ul: [
        "`larger:10M` finds every email over 10 MB.",
        "`larger:5M older_than:1y` finds big emails you haven’t needed for a year.",
        "`has:attachment larger:2M` finds emails with attachments over 2 MB.",
        "`filename:mp4` or `filename:zip` finds a particular attachment type.",
        "`smaller:` works the other way, if you want to exclude big ones.",
      ] },
      { p: "Sizes can be written as `M` for megabytes or `K` for kilobytes." },
      { h2: "Save what you want to keep" },
      { p: "Before deleting, open any email whose attachment you need and use the **Save to Drive** button on the attachment. Saved files count against the same storage, so this only makes sense for files you’ll actually use, but it does let you delete the email." },
      { h2: "Delete them in bulk" },
      { p: "Select all results and delete them in Gmail, or use [Offload](app)’s **Gmail** tab with the **Bigger than 10 MB** and **Has attachments** filters. It shows the count and the newest matches first, skips starred and important emails by default, and moves everything to Trash once you confirm." },
      { h2: "Empty the Trash" },
      { p: "Large emails in the Trash still use space for 30 days. Empty it when you’re done to see the space come back." },
    ],
  },
  {
    slug: "create-gmail-labels",
    title: "How to create labels in Gmail, and label emails automatically",
    description:
      "A step-by-step guide to creating Gmail labels, nesting and colouring them, and using filters so incoming email is labelled for you.",
    topic: "Gmail",
    date: "2026-10-23",
    keywords: ["create Gmail labels", "Gmail label creator", "how to make labels in Gmail", "Gmail filters auto label", "organise Gmail with labels"],
    body: [
      { p: "Gmail uses labels instead of folders. An email can have several labels at once, and removing a label never deletes the email. Set up a few good ones with filters, and your inbox sorts itself." },
      { h2: "Create a label" },
      { p: "The quickest way is in Gmail on the web:" },
      { ol: [
        "In the left sidebar, find **Labels** and click the **+** next to it.",
        "Type a name, such as “Receipts”.",
        "To put it inside another label, tick **Nest label under** and pick the parent.",
        "Click **Create**.",
      ] },
      { p: "You can also create one from an open email: click the label icon in the toolbar and choose **Create new**. Or manage all of them under **Settings → See all settings → Labels**." },
      { h2: "Give it a colour" },
      { p: "Hover over the label in the sidebar, click the three dots and choose **Label colour**. Colours make labelled emails easy to spot in a busy inbox." },
      { h2: "Label emails automatically with a filter" },
      { ol: [
        "Click the search options icon at the right of the Gmail search bar.",
        "Fill in who it’s from, words in the subject, or anything else that identifies the emails, for example `from:(receipts@shop.com)`.",
        "Click **Create filter**.",
        "Tick **Apply the label** and choose your label. Tick **Skip the Inbox (Archive it)** if you don’t want them in the inbox at all.",
        "Tick **Also apply filter to matching conversations** to label the emails you already have, then **Create filter**.",
      ] },
      { h2: "Labels that work well" },
      { ul: [
        "**Receipts**: order confirmations and invoices, filtered by sender or by words like “order” and “invoice”.",
        "**Newsletters**: everything containing “unsubscribe”, archived out of the inbox to read later.",
        "**Travel**: bookings from airlines and hotels.",
        "**Paperwork**: bank, tax and insurance, nested by year if you like.",
      ] },
      { h2: "Search and clean up by label" },
      { p: "Search `label:receipts` to see everything with a label. Labels with spaces use hyphens in search, so “Old Projects” becomes `label:old-projects`. Labels themselves don’t use storage, but the emails do." },
      { p: "To clear out a label in bulk, type its search into the **Has the words** field in [Offload](app)’s Gmail tab, for example `label:newsletters older_than:6m`. Offload shows how many emails match and moves them to Trash once you confirm, leaving starred and important ones alone. Offload doesn’t create labels itself; Gmail’s own label and filter tools above do that well." },
      { note: "Deleting a label removes the label, not the emails. They stay in your mailbox, still under All Mail." },
    ],
  },
  {
    slug: "gmail-search-operators",
    title: "Gmail search operators for cleaning up your inbox",
    description:
      "The Gmail search operators worth knowing for cleanup: by size, age, sender, category, attachment and label, plus ready-made searches to copy.",
    topic: "Gmail",
    date: "2026-10-23",
    keywords: ["Gmail search operators", "Gmail advanced search", "Gmail older_than", "Gmail larger search", "Gmail cleanup searches"],
    body: [
      { p: "Gmail’s search bar understands a set of operators that turn it into a precise cleanup tool. Combine them with spaces, and Gmail finds emails that match all of them." },
      { h2: "By sender, recipient and subject" },
      { ul: [
        "`from:name@example.com` or `from:(example.com)` for one sender or a whole domain.",
        "`to:me` for emails sent directly to you.",
        "`subject:(weekly digest)` for words in the subject.",
      ] },
      { h2: "By size" },
      { ul: [
        "`larger:10M` for emails over 10 MB.",
        "`smaller:500K` for emails under 500 KB.",
        "`has:attachment` for any email with an attachment, and `filename:pdf` for a file type.",
      ] },
      { h2: "By age" },
      { ul: [
        "`older_than:1y`, `older_than:6m` or `older_than:30d`.",
        "`newer_than:7d` for recent mail.",
        "`before:2023/01/01` and `after:2022/01/01` for exact dates.",
      ] },
      { h2: "By category, label and status" },
      { ul: [
        "`category:promotions`, `category:social`, `category:updates`, `category:forums`.",
        "`label:receipts` for a label. [How to create labels](/blog/create-gmail-labels).",
        "`is:unread`, `is:read`, `is:starred`, `is:important`.",
      ] },
      { h2: "Combining" },
      { ul: [
        "A minus sign excludes: `-is:starred`.",
        "`OR` (in capitals) matches either: `from:(shop.com) OR from:(store.com)`.",
        "Brackets group words: `subject:(order shipped)`.",
        "Quotes match an exact phrase: `\"your order has shipped\"`.",
      ] },
      { h2: "Searches to copy" },
      { ul: [
        "`category:promotions older_than:3m -is:starred`: old marketing email.",
        "`larger:10M older_than:1y`: big emails you haven’t needed for a year.",
        "`unsubscribe older_than:6m is:read`: newsletters you’ve already read.",
        "`category:social is:read`: social notifications you’ve seen.",
        "`from:(noreply) older_than:1y`: automated email over a year old.",
      ] },
      { p: "Any of these can go into the **Has the words** field in [Offload](app)’s Gmail tab, which shows the number of matches and trashes them in bulk once you confirm." },
    ],
  },
  {
    slug: "accept-google-drive-ownership-transfer",
    title: "How to accept Google Drive ownership transfers, all at once",
    description:
      "Someone, maybe you, sent your account a pile of ownership requests. Here’s how to find and accept them in Google Drive, or all at once with Offload.",
    topic: "Drive",
    date: "2026-10-23",
    keywords: ["accept ownership Google Drive", "pendingowner:me", "accept all ownership transfers Google Drive", "Google Drive ownership transfer request"],
    body: [
      { p: "In personal Google accounts, an ownership transfer only goes through when the receiving account accepts it. Until then, the file still belongs to, and counts against, the sender." },
      { h2: "Find pending requests in Drive" },
      { p: "Search Google Drive for `pendingowner:me`. It lists every file someone has asked you to take ownership of. You may also have an email from Google for each one." },
      { h2: "Accept in Drive" },
      { ol: [
        "Open the file’s **Share** settings.",
        "Next to the message about the pending transfer, choose **Accept ownership**.",
        "Confirm.",
      ] },
      { p: "That’s per file. For a few, it’s fine; for hundreds, it’s an evening." },
      { h2: "Accept everything with Offload" },
      { p: "Open [Offload](app) signed in to the receiving account and go to **Waiting for you**. It lists everything with a pending transfer to you. Select all and accept in one go." },
      { p: "Accepted folders keep their structure. Files that arrive on their own, without their folder, are gathered into a folder named “Transferred from” plus the sender’s address, so they don’t scatter across your Drive." },
      { h2: "After accepting" },
      { ul: [
        "The files now count against your storage, not the sender’s.",
        "The sender usually stays on as an editor. Remove them from sharing if you don’t want that.",
        "Storage figures in both accounts can take a few hours to update.",
      ] },
      { note: "Sent the request from your own other account? Remind yourself to empty that account’s Drive trash too, if you deleted anything along the way." },
    ],
  },
  {
    slug: "google-storage-still-full-after-deleting",
    title: "Deleted files but Google storage still full? Here’s why",
    description:
      "You cleared out Drive, Gmail or Photos and the storage meter didn’t move. The usual reasons, and how to fix each one.",
    topic: "Storage",
    date: "2026-10-23",
    keywords: ["Google storage still full after deleting", "Google Drive storage not updating", "Google storage not going down", "hidden files Google Drive storage"],
    body: [
      { p: "You’ve deleted gigabytes and Google still says you’re out of space. It’s almost always one of these." },
      { h2: "1. It’s in the trash" },
      { p: "Deleting moves things to the trash, and trash still counts. Drive and Gmail keep it for 30 days, Google Photos for 60. Empty all three to free the space now." },
      { h2: "2. The figure hasn’t caught up" },
      { p: "Google’s storage figures can take up to a day to update. If you emptied the trash recently, check again later." },
      { h2: "3. Ownership transfers weren’t accepted" },
      { p: "If you moved files to another account by transferring ownership, they count against you until the other account accepts. Open [Offload](app) as the other account and accept everything under **Waiting for you**, or see [how to accept transfers](/blog/accept-google-drive-ownership-transfer)." },
      { h2: "4. Files you own in other people’s folders" },
      { p: "Files you uploaded to someone else’s shared folder are still yours, and still count, even after you leave the folder. Search Drive for `is:unorganized owner:me` to find files you own that aren’t in any of your folders." },
      { h2: "5. Hidden app data" },
      { p: "Some apps store data in your Drive that you can’t see in the file list. In Drive’s **Settings → Manage apps**, each app’s **Options** menu shows whether it has hidden data and lets you delete it." },
      { h2: "6. Gmail Spam and backups" },
      { p: "Spam counts until it’s deleted, and Android device backups and WhatsApp backups count too. Check Google One’s storage page for backups you no longer need." },
      { h2: "7. The space is in a different service" },
      { p: "Drive, Gmail and Photos share one allowance. Cleaning Drive won’t help much if Photos holds 12 GB. Check the breakdown on one.google.com/storage, then see [the full storage guide](/blog/google-storage-full)." },
    ],
  },
  {
    slug: "google-app-not-verified-offload",
    title: "Why Google says Offload isn’t verified, and what it can access",
    description:
      "What the “Google hasn’t verified this app” screen means for Offload, what permissions it asks for, and where your files go.",
    topic: "Storage",
    date: "2026-10-23",
    keywords: ["Google hasn't verified this app", "is Offload safe", "Google Drive transfer tool safe", "Apps Script unverified app"],
    body: [
      { p: "When you first open Offload, Google may show a screen saying it hasn’t verified the app. Here’s what that means and what Offload can and can’t do." },
      { h2: "What the warning means" },
      { p: "Google shows it for apps that ask for sensitive permissions and haven’t finished Google’s review. Gmail access in particular is a restricted permission, and full verification includes an independent security assessment. Until then, an unverified app can be used by a limited number of accounts. To continue, choose **Advanced**, then **Go to Offload**." },
      { h2: "How Offload runs" },
      { p: "Offload is a Google Apps Script web app. It runs inside Google, under the account you sign in with, using the permissions you approve. It has no server and no database of its own, so there’s nowhere for your files to go. Drive transfers are Google’s own ownership transfer; photo copies go from one Google account to the other through Google’s servers." },
      { h2: "What it asks for, and why" },
      { ul: [
        "**Google Drive**: to list your folders and files, show sizes and storage, and request or accept the ownership transfers you choose.",
        "**Gmail**: to search your mail, show the count and the subject, sender and date of the newest matches, and move the emails you confirm to Trash. It doesn’t read, keep or send the content of your emails.",
        "**Google Photos** (only if you use that tab): Google’s picker shows Offload just the photos you select, and the other account grants add-only access, which can’t see anything already there.",
        "**Your email address**: to show which account you’re signed in with.",
      ] },
      { h2: "Removing access" },
      { p: "You can remove Offload any time from your Google Account under **Security → Third-party apps with account access**. The [privacy page](/privacy) has the full details." },
      { note: "Not sure yet? Try it on one small folder first, or just open the Gmail tab and look at the counts. Nothing changes until you confirm." },
    ],
  },
];

export const TOPICS: Topic[] = ["Storage", "Drive", "Gmail", "Photos"];

export function getPost(slug: string) {
  return POSTS.find((p) => p.slug === slug);
}

export function readingMinutes(post: Post) {
  const text = post.body
    .map((b) => ("h2" in b ? b.h2 : "p" in b ? b.p : "note" in b ? b.note : ("ul" in b ? b.ul : b.ol).join(" ")))
    .join(" ");
  return Math.max(2, Math.round(text.split(/\s+/).length / 220));
}

export function formatDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
