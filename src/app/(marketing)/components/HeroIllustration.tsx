export default function HeroIllustration() {
  return (
    <div className="relative w-full max-w-[480px] mx-auto">
      <svg
        viewBox="0 0 480 320"
        className="w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Monitor frame */}
        <rect x="40" y="20" width="400" height="260" rx="8" fill="#0a1628" stroke="#1e3a5f" strokeWidth="1.5" />
        <rect x="48" y="28" width="384" height="220" rx="4" fill="#0f1e3d" />

        {/* Top bar */}
        <rect x="48" y="28" width="384" height="28" fill="#161f30" />
        <circle cx="64" cy="42" r="4" fill="#374151" />
        <circle cx="78" cy="42" r="4" fill="#374151" />
        <circle cx="92" cy="42" r="4" fill="#374151" />
        <text x="240" y="46" fill="#64748b" fontSize="10" fontWeight="500" textAnchor="middle" fontFamily="system-ui, sans-serif">
          LaundroCFO Dashboard
        </text>

        {/* Metric cards row */}
        <rect x="60" y="68" width="88" height="52" rx="4" fill="#161f30" stroke="#1e3a5f" strokeWidth="0.75" />
        <text x="68" y="82" fill="#64748b" fontSize="8" fontWeight="500" fontFamily="system-ui, sans-serif">STORE VALUE</text>
        <text x="68" y="104" fill="#e2e8f0" fontSize="16" fontWeight="700" fontFamily="system-ui, sans-serif">$374,000</text>

        <rect x="160" y="68" width="88" height="52" rx="4" fill="#161f30" stroke="#1e3a5f" strokeWidth="0.75" />
        <text x="168" y="82" fill="#64748b" fontSize="8" fontWeight="500" fontFamily="system-ui, sans-serif">EBITDA</text>
        <text x="168" y="104" fill="#e2e8f0" fontSize="16" fontWeight="700" fontFamily="system-ui, sans-serif">$80,000</text>

        <rect x="260" y="68" width="88" height="52" rx="4" fill="#161f30" stroke="#1e3a5f" strokeWidth="0.75" />
        <text x="268" y="82" fill="#64748b" fontSize="8" fontWeight="500" fontFamily="system-ui, sans-serif">DSCR</text>
        <text x="268" y="104" fill="#e2e8f0" fontSize="16" fontWeight="700" fontFamily="system-ui, sans-serif">2.18x</text>

        <rect x="360" y="68" width="60" height="52" rx="4" fill="#161f30" stroke="#1e3a5f" strokeWidth="0.75" />
        <text x="368" y="82" fill="#64748b" fontSize="8" fontWeight="500" fontFamily="system-ui, sans-serif">SCORE</text>
        <text x="368" y="104" fill="#e2e8f0" fontSize="16" fontWeight="700" fontFamily="system-ui, sans-serif">89</text>

        {/* Bar chart */}
        <rect x="60" y="140" width="180" height="100" rx="4" fill="#161f30" stroke="#1e3a5f" strokeWidth="0.75" />
        <text x="68" y="154" fill="#64748b" fontSize="8" fontWeight="500" fontFamily="system-ui, sans-serif">REVENUE VS EBITDA</text>
        <rect x="76" y="210" width="14" height="20" rx="1" fill="#1D4ED8" opacity="0.7" />
        <rect x="96" y="200" width="14" height="30" rx="1" fill="#1D4ED8" opacity="0.8" />
        <rect x="116" y="195" width="14" height="35" rx="1" fill="#1D4ED8" opacity="0.85" />
        <rect x="136" y="190" width="14" height="40" rx="1" fill="#1D4ED8" />
        <rect x="156" y="198" width="14" height="32" rx="1" fill="#1D4ED8" opacity="0.9" />
        <rect x="176" y="185" width="14" height="45" rx="1" fill="#1D4ED8" />
        <rect x="196" y="192" width="14" height="38" rx="1" fill="#1D4ED8" opacity="0.95" />
        <rect x="216" y="188" width="14" height="42" rx="1" fill="#1D4ED8" />

        {/* Line chart */}
        <rect x="252" y="140" width="168" height="100" rx="4" fill="#161f30" stroke="#1e3a5f" strokeWidth="0.75" />
        <text x="260" y="154" fill="#64748b" fontSize="8" fontWeight="500" fontFamily="system-ui, sans-serif">VALUATION TREND</text>
        <polyline
          points="264,220 290,210 316,215 342,195 368,200 394,180 404,175"
          fill="none"
          stroke="#93c5fd"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="260" y1="230" x2="408" y2="230" stroke="#1e3a5f" strokeWidth="0.5" />

        {/* Stand */}
        <rect x="200" y="280" width="80" height="8" rx="2" fill="#1e3a5f" />
        <rect x="220" y="288" width="40" height="12" rx="2" fill="#0a1628" stroke="#1e3a5f" strokeWidth="0.75" />
      </svg>
    </div>
  );
}
