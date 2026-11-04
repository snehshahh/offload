import { POSTS, type Post, type Topic } from "@/lib/posts";

/** Cover art for a post: a small illustration of its topic, drawn in the site's colours. */

const BG: Record<Topic, string> = {
  Storage: "#FBBC04",
  Drive: "#FFF1C4",
  AI: "#1C1B17",
  Gmail: "#F1EBD9",
  Photos: "#FBF1DE",
};

const INK = "#1C1B17";
const PAPER = "#FFFFFF";
const SUN = "#FBBC04";
const RED = "#B4413A";

/** A stable small number from the slug, so each post's cover is a little different. */
function seed(slug: string) {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function Folder({ x, y, w, fill, stroke }: { x: number; y: number; w: number; fill: string; stroke?: string }) {
  const h = w * 0.7;
  const tab = w * 0.36;
  return (
    <path
      d={`M${x} ${y + 8}a8 8 0 0 1 8-8h${tab - 12}a6 6 0 0 1 4.4 1.9l5 5.1h${w - tab - 5}a8 8 0 0 1 8 8v${h - 15}a8 8 0 0 1-8 8h-${w - 16}a8 8 0 0 1-8-8Z`}
      fill={fill}
      stroke={stroke}
      strokeWidth={stroke ? 4 : 0}
    />
  );
}

function Meter({ x, y, w, f }: { x: number; y: number; w: number; f: number }) {
  return (
    <>
      <rect x={x} y={y} width={w} height="72" rx="16" fill={PAPER} />
      <rect x={x + 18} y={y + 16} width={w * 0.42} height="9" rx="4.5" fill="#E6DFCB" />
      <rect x={x + 18} y={y + 40} width={w - 36} height="14" rx="7" fill="#F1EBD9" />
      <rect x={x + 18} y={y + 40} width={(w - 36) * f} height="14" rx="7" fill={f > 0.9 ? RED : INK} />
    </>
  );
}

function Storage({ v }: { v: number }) {
  if (v === 1)
    // two accounts, space moving from the full one to the empty one
    return (
      <>
        <Meter x={34} y={54} w={112} f={0.95} />
        <Meter x={174} y={54} w={112} f={0.3} />
        <path d="M150 90h18m-7-7 7 7-7 7" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  if (v === 2)
    // where the 15 GB goes: Drive, Gmail, Photos
    return (
      <>
        <circle cx="160" cy="90" r="58" fill={PAPER} />
        <circle cx="160" cy="90" r="38" fill="none" stroke={INK} strokeWidth="22" strokeDasharray="120 239" transform="rotate(-90 160 90)" />
        <circle cx="160" cy="90" r="38" fill="none" stroke={RED} strokeWidth="22" strokeDasharray="0 120 70 239" transform="rotate(-90 160 90)" />
        <circle cx="160" cy="90" r="38" fill="none" stroke="#E6DFCB" strokeWidth="22" strokeDasharray="0 190 49 239" transform="rotate(-90 160 90)" />
      </>
    );
  if (v === 3)
    // a padlock: what Offload can and can't see
    return (
      <>
        <path d="M134 82v-16a26 26 0 0 1 52 0v16" fill="none" stroke={INK} strokeWidth="10" />
        <rect x="116" y="78" width="88" height="68" rx="14" fill={PAPER} />
        <circle cx="160" cy="106" r="8" fill={INK} />
        <rect x="156" y="108" width="8" height="18" rx="4" fill={INK} />
      </>
    );
  return <Meter x={60} y={54} w={200} f={0.97} />;
}

function Drive({ v }: { v: number }) {
  if (v === 2)
    // a list of files, biggest first
    return (
      <>
        <rect x="64" y="30" width="192" height="120" rx="16" fill={PAPER} />
        {[0.9, 0.62, 0.4, 0.22].map((f, i) => (
          <g key={i}>
            <rect x="82" y={46 + i * 24} width="14" height="14" rx="3" fill={i ? "#E6DFCB" : INK} />
            <rect x="104" y={50 + i * 24} width={130 * f} height="7" rx="3.5" fill={i ? "#E6DFCB" : SUN} />
          </g>
        ))}
      </>
    );
  if (v === 1)
    // one folder handing over to another
    return (
      <>
        <Folder x={40} y={58} w={96} fill={INK} />
        <path d="M148 92h26m-10-10 10 10-10 10" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <Folder x={186} y={58} w={96} fill={PAPER} stroke={INK} />
      </>
    );
  if (v === 3)
    // a pending transfer, with a tick to accept it
    return (
      <>
        <Folder x={80} y={50} w={120} fill={PAPER} stroke={INK} />
        <circle cx="214" cy="126" r="26" fill={SUN} stroke={INK} strokeWidth="4" />
        <path d="M202 126l8 8 15-16" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  return (
    <>
      <Folder x={58} y={42} w={110} fill={INK} />
      <Folder x={150} y={74} w={112} fill={PAPER} stroke={INK} />
    </>
  );
}

function Envelope({ x, y, fill }: { x: number; y: number; fill: string }) {
  return (
    <>
      <rect x={x} y={y} width="136" height="92" rx="12" fill={fill} />
      <path d={`M${x + 10} ${y + 14}l58 42 58-42`} fill="none" stroke={RED} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

function Gmail({ v }: { v: number }) {
  if (v === 1)
    // a promotions pile, being cleared
    return (
      <>
        <rect x="64" y="30" width="192" height="120" rx="16" fill={PAPER} />
        {[0, 1, 2, 3].map((i) => (
          <g key={i} opacity={i === 3 ? 0.35 : 1}>
            <rect x="82" y={46 + i * 24} width="14" height="14" rx="3" fill={i < 3 ? INK : "none"} stroke={INK} strokeWidth="2" />
            <rect x="106" y={50 + i * 24} width={[110, 86, 120, 70][i]} height="7" rx="3.5" fill="#E6DFCB" />
          </g>
        ))}
      </>
    );
  if (v === 2)
    // one email with a big attachment
    return (
      <>
        <Envelope x={74} y={46} fill={PAPER} />
        <rect x="176" y="86" width="72" height="54" rx="10" fill={INK} />
        <rect x="188" y="100" width="34" height="7" rx="3.5" fill={SUN} />
        <rect x="188" y="116" width="48" height="7" rx="3.5" fill="#736F5D" />
      </>
    );
  if (v === 3)
    // labels
    return (
      <>
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${70 + i * 18} ${40 + i * 34})`}>
            <path d="M0 10a10 10 0 0 1 10-10h110l24 16-24 16H10A10 10 0 0 1 0 22Z" fill={[INK, PAPER, SUN][i]} stroke={INK} strokeWidth={i ? 3 : 0} />
            <rect x="16" y="12" width={[70, 54, 80][i]} height="8" rx="4" fill={i === 0 ? "#736F5D" : "#E6DFCB"} />
          </g>
        ))}
      </>
    );
  if (v === 4)
    // a search box
    return (
      <>
        <rect x="44" y="64" width="232" height="52" rx="26" fill={PAPER} />
        <circle cx="76" cy="88" r="10" fill="none" stroke={INK} strokeWidth="4" />
        <path d="M83 95l8 8" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        <rect x="104" y="83" width="62" height="12" rx="6" fill={SUN} />
        <rect x="174" y="83" width="74" height="12" rx="6" fill="#E6DFCB" />
      </>
    );
  return (
    <>
      <rect x="92" y="40" width="136" height="92" rx="12" fill="#E6DFCB" />
      <rect x="104" y="48" width="136" height="92" rx="12" fill="#D9D0B8" opacity=".6" />
      <Envelope x={116} y={56} fill={PAPER} />
      <circle cx="252" cy="56" r="16" fill={SUN} stroke={INK} strokeWidth="4" />
    </>
  );
}

function Photos({ v }: { v: number }) {
  const tilt = [-6, -3, -8][v % 3];
  return (
    <>
      <g transform={`rotate(${tilt} 130 92)`}>
        <rect x="70" y="40" width="120" height="100" rx="12" fill="#E6DFCB" />
      </g>
      <g transform="rotate(5 190 92)">
        <rect x="124" y="36" width="136" height="108" rx="12" fill={PAPER} />
        <rect x="136" y="48" width="112" height="72" rx="6" fill="#FFF1C4" />
        <circle cx="222" cy="68" r="10" fill={SUN} />
        <path d="M136 120l34-36 24 24 16-14 38 26Z" fill={INK} />
      </g>
    </>
  );
}

function AI({ v }: { v: number }) {
  if (v === 2)
    // a settings switch, turned on
    return (
      <>
        <rect x="60" y="44" width="200" height="92" rx="18" fill="#2E2C26" />
        <rect x="80" y="66" width="76" height="9" rx="4.5" fill="#736F5D" />
        <rect x="80" y="84" width="50" height="9" rx="4.5" fill="#46433A" />
        <rect x="180" y="62" width="60" height="34" rx="17" fill={SUN} />
        <circle cx="223" cy="79" r="12" fill={INK} />
        <rect x="80" y="110" width="110" height="9" rx="4.5" fill="#46433A" />
      </>
    );
  if (v === 3)
    // a plug and socket: the connector
    return (
      <>
        <rect x="58" y="70" width="72" height="40" rx="12" fill={SUN} />
        <rect x="130" y="78" width="22" height="8" rx="3" fill={SUN} />
        <rect x="130" y="94" width="22" height="8" rx="3" fill={SUN} />
        <path d="M58 90H30" stroke={SUN} strokeWidth="8" strokeLinecap="round" />
        <rect x="176" y="58" width="86" height="64" rx="16" fill="#2E2C26" />
        <rect x="190" y="78" width="10" height="8" rx="2" fill={INK} />
        <rect x="190" y="94" width="10" height="8" rx="2" fill={INK} />
        <path d="M262 90h28" stroke="#46433A" strokeWidth="8" strokeLinecap="round" />
      </>
    );
  if (v === 4)
    // searching across accounts
    return (
      <>
        {[0, 1, 2].map((i) => (
          <rect key={i} x={56 + i * 70} y="52" width="58" height="76" rx="12" fill="#2E2C26" />
        ))}
        <circle cx="188" cy="86" r="34" fill="none" stroke={SUN} strokeWidth="10" />
        <path d="M212 112l26 26" stroke={SUN} strokeWidth="12" strokeLinecap="round" />
      </>
    );
  if (v === 5)
    // a list of things to ask
    return (
      <>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x={70 + (i % 2) * 24} y={36 + i * 40} width={[170, 150, 160][i]} height="30" rx="15" fill={i === 1 ? SUN : "#2E2C26"} />
            <rect x={86 + (i % 2) * 24} y={47 + i * 40} width={[110, 96, 100][i]} height="8" rx="4" fill={i === 1 ? INK : "#736F5D"} opacity={i === 1 ? 0.55 : 1} />
          </g>
        ))}
      </>
    );
  if (v === 6)
    // a shield with a tick
    return (
      <>
        <path d="M160 30l52 18v38c0 32-22 54-52 66-30-12-52-34-52-66V48Z" fill={SUN} />
        <path d="M138 90l15 15 30-32" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  if (v === 7)
    // a spanner, for fixes
    return (
      <>
        <rect x="56" y="98" width="140" height="48" rx="16" fill="#2E2C26" />
        <rect x="74" y="116" width="80" height="9" rx="4.5" fill="#736F5D" />
        <g transform="rotate(-45 210 80)">
          <rect x="196" y="62" width="28" height="96" rx="14" fill={SUN} />
          <circle cx="210" cy="54" r="30" fill={SUN} />
          <rect x="200" y="20" width="20" height="34" rx="4" fill={INK} />
        </g>
      </>
    );
  if (v === 1)
    // a reply that used one of Offload's tools
    return (
      <>
        <rect x="150" y="30" width="114" height="36" rx="18" fill={SUN} />
        <rect x="168" y="44" width="70" height="8" rx="4" fill={INK} opacity=".55" />
        <rect x="56" y="80" width="200" height="72" rx="20" fill="#2E2C26" />
        <rect x="74" y="96" width="88" height="16" rx="8" fill="#6B4E00" />
        <rect x="74" y="122" width="140" height="9" rx="4.5" fill="#736F5D" />
      </>
    );
  return (
    <>
      <rect x="114" y="34" width="150" height="40" rx="20" fill={SUN} />
      <rect x="56" y="88" width="180" height="58" rx="20" fill="#2E2C26" />
      <rect x="74" y="104" width="120" height="9" rx="4.5" fill="#736F5D" />
      <rect x="74" y="122" width="80" height="9" rx="4.5" fill="#736F5D" />
      <rect x="132" y="50" width="90" height="9" rx="4.5" fill={INK} opacity=".55" />
    </>
  );
}

const ART: Record<Topic, (p: { v: number }) => React.ReactElement> = { Storage, Drive, Gmail, Photos, AI };

export function PostCover({ post, className }: { post: Post; className?: string }) {
  const s = seed(post.slug);
  const Art = ART[post.topic];
  // Each post in a topic gets its own drawing, in the order the posts are listed.
  const v = POSTS.filter((p) => p.topic === post.topic).findIndex((p) => p.slug === post.slug);
  const dot = post.topic === "AI" ? "#46433A" : post.topic === "Storage" ? "#E9A800" : "#E6DFCB";
  return (
    <svg className={className ? `post-cover ${className}` : "post-cover"} viewBox="0 0 320 180" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="180" fill={BG[post.topic]} />
      <circle cx={s % 2 ? 300 : 20} cy={s % 3 ? 170 : 12} r={40 + (s % 5) * 6} fill={dot} opacity=".7" />
      <Art v={v} />
    </svg>
  );
}
