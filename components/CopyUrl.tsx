"use client";

import { useState } from "react";

/** The connector address with a Copy button. */
export function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the address is still there to select */
    }
  };
  return (
    <div className="copyurl">
      <code>{url}</code>
      <button type="button" className="btn btn-main" onClick={copy} aria-live="polite">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
