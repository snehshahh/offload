/** The Offload mark: one folder handing over to another. */
export function Mark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#2F6F62" />
      <path d="M9 19.5a3.5 3.5 0 0 1 3.5-3.5h6.4a3 3 0 0 1 2.2.9l2 2.1h11.4a3.5 3.5 0 0 1 3.5 3.5v13a3.5 3.5 0 0 1-3.5 3.5h-22A3.5 3.5 0 0 1 9 35.5Z" fill="#8FC4B6" />
      <path d="M22 29.5a4 4 0 0 1 4-4h7.6a3.6 3.6 0 0 1 2.6 1.1l2.3 2.4h13.5a4 4 0 0 1 4 4v15a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4Z" fill="#fff" stroke="#2F6F62" strokeWidth="2.5" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <Mark />
      <span className="logo-word">Offload</span>
    </span>
  );
}
