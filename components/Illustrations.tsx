/**
 * Decorative illustrations for the home page, drawn in the site's colours.
 * All of them are aria-hidden: the text next to them says the same thing.
 * The motion lives in globals.css (look for "illustrations"), and stops under prefers-reduced-motion.
 */

const INK = "#1C1B17";
const SUN = "#FBBC04";
const SUN_SOFT = "#FFF1C4";
const PAPER = "#FFFFFF";
const HAIR = "#E6DFCB";
const SLATE = "#F1EBD9";
const RED = "#B4413A";

const FOLDER = "M0 6a6 6 0 0 1 6-6h9.5a4.5 4.5 0 0 1 3.3 1.4L22 5h20a6 6 0 0 1 6 6v21a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6Z";

function Sparkle({ x, y, s = 1, className = "" }: { x: number; y: number; s?: number; className?: string }) {
  return (
    <path
      className={"twinkle " + className}
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0-10C1-3 3-1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10Z"
      fill={INK}
    />
  );
}

/** Things floating around the hero demo: a freed-space pill, a photo, an email chip, a spinning stamp. */
export function HeroFloaters() {
  return (
    <div className="floaters" aria-hidden="true">
      <span className="float f-pill">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
        6.2 GB freed
      </span>

      <span className="float f-photo">
        <svg width="64" height="54" viewBox="0 0 64 54">
          <rect x="0" y="0" width="64" height="54" rx="10" fill={PAPER} />
          <rect x="5" y="5" width="54" height="36" rx="6" fill={SUN_SOFT} />
          <circle cx="45" cy="15" r="5" fill={SUN} />
          <path d="M5 35l14-14 11 11 7-6 22 15v0a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6Z" fill={INK} />
          <rect x="7" y="46" width="26" height="3.5" rx="1.75" fill={HAIR} />
        </svg>
      </span>

      <span className="float f-mail">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="m4 7 8 6 8-6" />
        </svg>
        3,270 old emails
        <b>Trash</b>
      </span>

      <span className="float f-stamp">
        <svg width="104" height="104" viewBox="0 0 104 104">
          <defs>
            <path id="stamp-ring" d="M52 52m-38 0a38 38 0 1 1 76 0a38 38 0 1 1-76 0" />
          </defs>
          <circle cx="52" cy="52" r="51" fill={INK} />
          <g className="spin">
            <text fill={SUN} fontFamily="IBM Plex Mono, monospace" fontSize="9.6" fontWeight="500">
              <textPath href="#stamp-ring" textLength="234" lengthAdjust="spacing">FREE TOOL • NO INSTALL • AI-POWERED •</textPath>
            </text>
          </g>
          <g transform="translate(34 37)">
            <path d={FOLDER} transform="scale(.75)" fill={SUN} />
            <path d="M13 17h10m-4-4 4 4-4 4" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
      </span>

      <svg className="float f-spark" width="40" height="40" viewBox="-20 -20 40 40">
        <Sparkle x={0} y={0} s={1.6} />
      </svg>
      <svg className="float f-spark2" width="26" height="26" viewBox="-13 -13 26 26">
        <Sparkle x={0} y={0} s={1} className="late" />
      </svg>
    </div>
  );
}

/** Soft drifting glows and a dotted grid behind the hero. */
export function HeroBackdrop() {
  return (
    <div className="hero-bg" aria-hidden="true">
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="grid" />
    </div>
  );
}

function Person({ x, y, fill, stroke }: { x: number; y: number; fill: string; stroke?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="27" fill={fill} stroke={stroke ?? "none"} strokeWidth="3" />
      <circle cy="-6" r="8.5" fill={INK} />
      <path d="M-15 15a15 13 0 0 1 30 0" fill={INK} />
    </g>
  );
}

/** Step 1: two accounts link up. */
function StepSignIn() {
  return (
    <svg viewBox="0 0 240 140" className="step-art-svg">
      <rect x="0" y="0" width="240" height="140" rx="20" fill={SUN_SOFT} />
      <path className="dash-flow" d="M95 70H145" stroke={INK} strokeWidth="3" strokeDasharray="6 6" strokeLinecap="round" />
      <Person x={68} y={70} fill={SUN} />
      <g className="stack">
        <circle cx="214" cy="32" r="10" fill={PAPER} stroke={INK} strokeWidth="2.5" />
        <circle cx="228" cy="50" r="7.5" fill={SUN} stroke={INK} strokeWidth="2.5" />
      </g>
      <Person x={172} y={70} fill={PAPER} stroke={INK} />
      <g className="pop" transform="translate(120 70)">
        <circle r="13" fill={INK} />
        <path d="M-5.5 0.5l3.5 3.5 7-7.5" fill="none" stroke={PAPER} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <rect x="44" y="110" width="48" height="7" rx="3.5" fill={INK} opacity=".18" />
      <rect x="148" y="110" width="48" height="7" rx="3.5" fill={INK} opacity=".18" />
    </svg>
  );
}

/** Step 2: folders get ticked, one after another. */
function StepPick() {
  const rows = [
    { y: 26, w: 66, size: "4.6 GB" },
    { y: 62, w: 52, size: "3.9 GB" },
    { y: 98, w: 40, size: "1.8 GB" },
  ];
  return (
    <svg viewBox="0 0 240 140" className="step-art-svg">
      <rect x="0" y="0" width="240" height="140" rx="20" fill={SUN} />
      <rect x="18" y="12" width="204" height="116" rx="14" fill={PAPER} />
      {rows.map((r, i) => (
        <g key={r.y} className={`tick-row r${i + 1}`}>
          <rect className="tick-bg" x="28" y={r.y - 4} width="184" height="30" rx="8" fill={SUN_SOFT} />
          <rect className="tick-box" x="36" y={r.y + 3} width="16" height="16" rx="4" fill={INK} stroke={INK} strokeWidth="2" />
          <path className="tick-mark" d={`M40 ${r.y + 11}l3 3 6-6.5`} fill="none" stroke={PAPER} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d={FOLDER} transform={`translate(62 ${r.y + 3}) scale(.42)`} fill={INK} />
          <rect x="88" y={r.y + 7} width={r.w} height="8" rx="4" fill={HAIR} />
          <text x="204" y={r.y + 15} textAnchor="end" fontFamily="IBM Plex Mono, monospace" fontSize="10" fontWeight="500" fill={INK}>
            {r.size}
          </text>
        </g>
      ))}
      <g className="cursor">
        <path d="M0 0v17l4.5-4.2 3.2 7 3.3-1.5-3.2-6.8H14Z" fill={INK} stroke={PAPER} strokeWidth="1.6" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Step 3: a folder flies from the full account to the roomy one, and the meters follow. */
function StepMove() {
  return (
    <svg viewBox="0 0 240 140" className="step-art-svg">
      <rect x="0" y="0" width="240" height="140" rx="20" fill={INK} />
      <path d="M62 62C90 22 150 22 178 62" fill="none" stroke={SUN} strokeOpacity=".35" strokeWidth="2.5" strokeDasharray="4 7" strokeLinecap="round" />
      <g>
        <rect x="18" y="64" width="88" height="56" rx="12" fill={PAPER} />
        <rect x="30" y="76" width="40" height="6" rx="3" fill={HAIR} />
        <rect x="30" y="100" width="64" height="8" rx="4" fill={SLATE} />
        <rect className="bar-down" x="30" y="100" width="64" height="8" rx="4" fill={RED} />
      </g>
      <g>
        <rect x="134" y="64" width="88" height="56" rx="12" fill={PAPER} />
        <rect x="146" y="76" width="40" height="6" rx="3" fill={HAIR} />
        <rect x="146" y="100" width="64" height="8" rx="4" fill={SLATE} />
        <rect className="bar-up" x="146" y="100" width="64" height="8" rx="4" fill={INK} />
      </g>
      <g className="fly">
        <path d={FOLDER} transform="translate(46 34) scale(.66)" fill={SUN} stroke={INK} strokeWidth="2.5" />
      </g>
      <Sparkle x={206} y={30} s={0.8} className="sun" />
    </svg>
  );
}

export function StepArt({ step }: { step: number }) {
  return (
    <div className="step-art" aria-hidden="true">
      {step === 0 ? <StepSignIn /> : step === 1 ? <StepPick /> : <StepMove />}
    </div>
  );
}

/** Privacy: your browser talks to Google directly; Offload's server keeps nothing. */
export function PrivacyArt() {
  return (
    <svg className="privacy-art" viewBox="0 0 420 190" aria-hidden="true">
      {/* browser */}
      <g>
        <rect x="8" y="34" width="132" height="104" rx="14" fill={PAPER} stroke={INK} strokeWidth="2.5" />
        <path d="M8 56h132" stroke={INK} strokeWidth="2.5" />
        <circle cx="24" cy="45" r="3.5" fill={RED} />
        <circle cx="36" cy="45" r="3.5" fill={SUN} />
        <circle cx="48" cy="45" r="3.5" fill={HAIR} />
        <path d={FOLDER} transform="translate(50 76) scale(.95)" fill={SUN} stroke={INK} strokeWidth="2.2" />
        <text x="74" y="160" textAnchor="middle" fontFamily="Onest Variable, Onest, sans-serif" fontSize="13" fontWeight="600" fill={INK}>
          Your browser
        </text>
      </g>
      {/* line to Google */}
      <path className="dash-flow" d="M150 86H268" stroke={INK} strokeWidth="3" strokeDasharray="7 7" strokeLinecap="round" />
      <g className="pulse-dot">
        <circle cx="150" cy="86" r="6" fill={SUN} stroke={INK} strokeWidth="2" />
      </g>
      {/* cloud */}
      <g>
        <path
          d="M300 120h76a28 28 0 0 0 4-55.7A40 40 0 0 0 304 58a31 31 0 0 0-4 62Z"
          fill={SUN}
          stroke={INK}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <g className="lock-bob">
          <rect x="324" y="78" width="30" height="24" rx="6" fill={INK} />
          <path d="M330 78v-6a9 9 0 0 1 18 0v6" fill="none" stroke={INK} strokeWidth="3.4" />
          <circle cx="339" cy="90" r="3.2" fill={SUN} />
        </g>
        <text x="340" y="160" textAnchor="middle" fontFamily="Onest Variable, Onest, sans-serif" fontSize="13" fontWeight="600" fill={INK}>
          Google
        </text>
      </g>
      {/* the server that keeps nothing */}
      <g opacity=".9">
        <rect x="186" y="128" width="48" height="40" rx="8" fill={SLATE} stroke="#BDB59E" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M196 142h28M196 154h18" stroke="#BDB59E" strokeWidth="2.5" strokeLinecap="round" />
        <text x="210" y="186" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fill="#736F5D">
          nothing stored
        </text>
      </g>
      <Sparkle x={292} y={30} s={0.9} />
      <Sparkle x={396} y={34} s={0.6} className="late" />
    </svg>
  );
}

/** Folders drifting up behind the closing call to action. */
export function BandArt() {
  return (
    <svg className="band-art" viewBox="0 0 420 260" aria-hidden="true" preserveAspectRatio="xMaxYMid slice">
      <circle className="spin-slow" cx="330" cy="130" r="110" fill="none" stroke={SUN} strokeOpacity=".22" strokeWidth="2" strokeDasharray="3 10" />
      <circle cx="330" cy="130" r="70" fill={SUN} fillOpacity=".07" />
      <g className="drift d1">
        <path d={FOLDER} transform="translate(250 170) scale(1.1)" fill={SUN} fillOpacity=".35" />
      </g>
      <g className="drift d2">
        <path d={FOLDER} transform="translate(350 60) scale(.8)" fill={PAPER} fillOpacity=".14" />
      </g>
      <g className="drift d3">
        <path d={FOLDER} transform="translate(380 180) scale(.55)" fill={SUN} fillOpacity=".5" />
      </g>
      <g className="twinkle-wrap">
        <path className="twinkle" transform="translate(220 60) scale(1.1)" d="M0-10C1-3 3-1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10Z" fill={SUN} />
        <path className="twinkle late" transform="translate(300 230) scale(.7)" d="M0-10C1-3 3-1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10Z" fill={SUN} />
      </g>
    </svg>
  );
}
