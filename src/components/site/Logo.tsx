/** Concentric aperture — targeting, which is what the product does. */
export function Mark({ size = 44 }: { size?: number }) {
  const inner = Math.round(size * 0.5);
  return (
    <div
      className="grid shrink-0 place-items-center rounded-xl"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(145deg,#9d85ff,#5b3ce0 60%,#3a24a8)",
        boxShadow:
          "0 1px 0 0 rgba(255,255,255,.28) inset, 0 10px 26px -8px rgba(124,92,255,.7)",
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8.5" stroke="white" strokeWidth="1.6" opacity=".55" />
        <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="1.5" fill="white" />
        <path
          d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity=".75"
        />
      </svg>
    </div>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      Skillful
      <span className="bg-gradient-to-r from-[#9d85ff] to-[#4f9dff] bg-clip-text text-transparent">
        GTM
      </span>
    </span>
  );
}
