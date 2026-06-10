export default function HeroIllustration() {
  return (
    <div className="relative w-full max-w-[520px] mx-auto">
      {/* Floating data cards */}
      <div
        className="absolute -top-2 -left-4 z-20 px-3 py-2 rounded-lg text-[11px] font-semibold shadow-lg animate-[float_4s_ease-in-out_infinite]"
        style={{ background: "rgba(15,30,61,0.95)", border: "1px solid rgba(37,99,235,0.4)", color: "#4ade80" }}
      >
        Store Value <span className="text-green-400">+12%</span>
      </div>
      <div
        className="absolute top-16 -right-6 z-20 px-3 py-2 rounded-lg text-[11px] font-semibold shadow-lg animate-[float_5s_ease-in-out_infinite_0.5s]"
        style={{ background: "rgba(15,30,61,0.95)", border: "1px solid rgba(37,99,235,0.4)", color: "#e2e8f0" }}
      >
        DSCR <span className="text-blue-400">2.14x</span>
      </div>
      <div
        className="absolute bottom-32 -left-8 z-20 px-3 py-2 rounded-lg text-[11px] font-semibold shadow-lg animate-[float_4.5s_ease-in-out_infinite_1s]"
        style={{ background: "rgba(15,30,61,0.95)", border: "1px solid rgba(37,99,235,0.4)", color: "#e2e8f0" }}
      >
        Lease Score <span className="text-blue-400">94</span>
      </div>
      <div
        className="absolute bottom-8 -right-4 z-20 px-3 py-2 rounded-lg text-[11px] font-semibold shadow-lg animate-[float_5.5s_ease-in-out_infinite_1.5s]"
        style={{ background: "rgba(15,30,61,0.95)", border: "1px solid rgba(37,99,235,0.4)", color: "#e2e8f0" }}
      >
        Equipment Grade <span className="text-green-400">A</span>
      </div>

      {/* Brand title */}
      <div
        className="text-center mb-4 font-extrabold tracking-tight"
        style={{
          fontSize: "32px",
          background: "linear-gradient(135deg, #ffffff 0%, #93c5fd 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        LaundroCFO
      </div>

      {/* Blue aura glow */}
      <div
        className="absolute inset-0 rounded-3xl blur-3xl opacity-40"
        style={{ background: "radial-gradient(ellipse at center, #2563eb 0%, transparent 70%)" }}
      />

      <svg
        viewBox="0 0 480 520"
        className="relative w-full h-auto drop-shadow-2xl"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="machineBody" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e3a5f" />
            <stop offset="50%" stopColor="#0f2744" />
            <stop offset="100%" stopColor="#0a1628" />
          </linearGradient>
          <linearGradient id="doorRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="gaugeFill" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="60%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softGlow">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Floating numbers */}
        <text x="30" y="80" fill="#4ade80" fontSize="14" fontWeight="700" opacity="0.9" filter="url(#glow)">
          $825K
        </text>
        <text x="400" y="120" fill="#60a5fa" fontSize="12" fontWeight="600" opacity="0.85">
          +18.4%
        </text>
        <text x="50" y="450" fill="#93c5fd" fontSize="11" fontWeight="600" opacity="0.8">
          4.7x
        </text>
        <text x="380" y="480" fill="#4ade80" fontSize="13" fontWeight="700" opacity="0.9">
          89/100
        </text>

        {/* Machine body */}
        <rect x="80" y="100" width="320" height="380" rx="24" fill="url(#machineBody)" stroke="#2563eb" strokeWidth="1.5" opacity="0.95" />
        <rect x="88" y="108" width="304" height="12" rx="4" fill="#2563eb" opacity="0.3" />

        {/* Control panel */}
        <rect x="100" y="125" width="280" height="70" rx="10" fill="#0a1628" stroke="#1e40af" strokeWidth="1" />
        <rect x="115" y="140" width="75" height="40" rx="6" fill="#111d35" stroke="#2563eb" strokeWidth="0.5" />
        <text x="122" y="158" fill="#64748b" fontSize="8" fontWeight="500">STORE VALUE</text>
        <text x="122" y="175" fill="#4ade80" fontSize="16" fontWeight="800">$825K</text>

        <rect x="205" y="140" width="75" height="40" rx="6" fill="#111d35" stroke="#2563eb" strokeWidth="0.5" />
        <text x="212" y="158" fill="#64748b" fontSize="8" fontWeight="500">DSCR</text>
        <text x="212" y="175" fill="#60a5fa" fontSize="16" fontWeight="800">2.1x</text>

        <rect x="295" y="140" width="75" height="40" rx="6" fill="#111d35" stroke="#2563eb" strokeWidth="0.5" />
        <text x="302" y="158" fill="#64748b" fontSize="8" fontWeight="500">SCORE</text>
        <text x="302" y="175" fill="#fbbf24" fontSize="16" fontWeight="800">89/100</text>

        {/* Mini bar chart on panel */}
        <rect x="115" y="195" width="8" height="12" rx="1" fill="#2563eb" opacity="0.6" />
        <rect x="128" y="190" width="8" height="17" rx="1" fill="#3b82f6" opacity="0.7" />
        <rect x="141" y="185" width="8" height="22" rx="1" fill="#60a5fa" opacity="0.8" />
        <rect x="154" y="180" width="8" height="27" rx="1" fill="#4ade80" opacity="0.9" />
        <rect x="167" y="175" width="8" height="32" rx="1" fill="#22c55e" />

        {/* Line graph */}
        <polyline
          points="220,210 235,200 250,205 265,185 280,190 295,170 310,175 325,160 340,165"
          fill="none"
          stroke="#60a5fa"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="340" cy="165" r="3" fill="#4ade80" />

        {/* Circular door */}
        <circle cx="240" cy="310" r="105" fill="#0a1628" stroke="url(#doorRing)" strokeWidth="6" filter="url(#softGlow)" />
        <circle cx="240" cy="310" r="95" fill="#0d1f3c" stroke="#1e3a5f" strokeWidth="2" />

        {/* Pie chart in door window */}
        <circle cx="240" cy="310" r="70" fill="#111d35" />
        <path d="M 240 310 L 240 240 A 70 70 0 0 1 305 350 Z" fill="#22c55e" opacity="0.85" />
        <path d="M 240 310 L 305 350 A 70 70 0 0 1 270 378 Z" fill="#2563eb" opacity="0.85" />
        <path d="M 240 310 L 270 378 A 70 70 0 0 1 175 310 Z" fill="#60a5fa" opacity="0.75" />
        <path d="M 240 310 L 175 310 A 70 70 0 0 1 240 240 Z" fill="#1e40af" opacity="0.7" />

        {/* Center gauge */}
        <circle cx="240" cy="310" r="35" fill="#0a1628" stroke="#2563eb" strokeWidth="2" />
        <path
          d="M 240 310 L 240 285 A 25 25 0 1 1 258 320 Z"
          fill="url(#gaugeFill)"
          opacity="0.9"
        />
        <text x="240" y="308" fill="#ffffff" fontSize="11" fontWeight="800" textAnchor="middle">4.7x</text>
        <text x="240" y="322" fill="#94a3b8" fontSize="7" fontWeight="500" textAnchor="middle">MULTIPLE</text>

        {/* Door handle */}
        <rect x="330" y="295" width="12" height="30" rx="6" fill="#3b82f6" opacity="0.8" />

        {/* Side bar charts integrated in body */}
        <rect x="95" y="420" width="12" height="45" rx="2" fill="#1e40af" opacity="0.5" />
        <rect x="112" y="405" width="12" height="60" rx="2" fill="#2563eb" opacity="0.6" />
        <rect x="129" y="390" width="12" height="75" rx="2" fill="#3b82f6" opacity="0.7" />
        <rect x="146" y="375" width="12" height="90" rx="2" fill="#4ade80" opacity="0.8" />

        <rect x="322" y="415" width="12" height="50" rx="2" fill="#1e40af" opacity="0.5" />
        <rect x="339" y="400" width="12" height="65" rx="2" fill="#2563eb" opacity="0.6" />
        <rect x="356" y="385" width="12" height="80" rx="2" fill="#3b82f6" opacity="0.7" />
        <rect x="373" y="370" width="12" height="95" rx="2" fill="#60a5fa" opacity="0.8" />

        {/* Bottom trim / feet */}
        <rect x="100" y="470" width="280" height="8" rx="4" fill="#2563eb" opacity="0.4" />
        <rect x="120" y="478" width="40" height="12" rx="4" fill="#1e3a5f" stroke="#2563eb" strokeWidth="0.5" />
        <rect x="320" y="478" width="40" height="12" rx="4" fill="#1e3a5f" stroke="#2563eb" strokeWidth="0.5" />

        {/* Status LEDs */}
        <circle cx="355" cy="135" r="4" fill="#22c55e" filter="url(#glow)" />
        <circle cx="368" cy="135" r="4" fill="#3b82f6" opacity="0.8" />
        <circle cx="381" cy="135" r="4" fill="#fbbf24" opacity="0.6" />
      </svg>
    </div>
  );
}
