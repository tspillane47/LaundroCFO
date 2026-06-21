import Link from 'next/link'

export default function Logo() {
  return (
    <Link href="/" className="inline-block hover:opacity-90 transition-opacity">
      <svg
        width="240"
        viewBox="0 0 360 84"
        role="img"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>LaundroCFO</title>
        <defs>
          <clipPath id="porthole-clip">
            <circle cx="43" cy="44" r="14" />
          </clipPath>
          <style>{`
            .logo-pill   { fill: #1a3d2b; }
            .logo-accent { fill: #7ecba1; }
            .logo-cfo    { fill: #7ecba1; }
            @media (prefers-color-scheme: dark) {
              .logo-pill   { fill: #0f2244; }
              .logo-accent { fill: #5b9ef5; }
              .logo-cfo    { fill: #5b9ef5; }
            }
            .bar {
              transform-origin: bottom;
              animation: growBar 0.6s cubic-bezier(0.22,1,0.36,1) both;
            }
            .bar1 { animation-delay: 0.10s; }
            .bar2 { animation-delay: 0.22s; }
            .bar3 { animation-delay: 0.34s; }
            .bar4 { animation-delay: 0.46s; }
            @keyframes growBar {
              from { transform: scaleY(0); }
              to   { transform: scaleY(1); }
            }
          `}</style>
        </defs>
        <rect className="logo-pill" x="0" y="0" width="360" height="84" rx="14" />
        <rect x="16" y="8" width="54" height="68" rx="5" fill="none" stroke="#ffffff" strokeWidth="2.2" />
        <line x1="16" y1="22" x2="70" y2="22" stroke="#ffffff" strokeWidth="1.4" />
        <circle cx="26" cy="15" r="2.4" fill="none" stroke="#ffffff" strokeWidth="1.4" />
        <circle cx="36" cy="15" r="2.4" fill="none" stroke="#ffffff" strokeWidth="1.4" />
        <circle cx="43" cy="44" r="20" fill="none" stroke="#ffffff" strokeWidth="2" />
        <circle cx="43" cy="44" r="15" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.35" />
        <g clipPath="url(#porthole-clip)">
          <rect className="bar bar1 logo-accent" x="30" y="52" width="6" height="8"  rx="1" />
          <rect className="bar bar2 logo-accent" x="38" y="45" width="6" height="15" rx="1" />
          <rect className="bar bar3"             x="46" y="38" width="6" height="22" rx="1" fill="#ffffff" />
          <rect className="bar bar4 logo-accent" x="54" y="41" width="6" height="19" rx="1" />
        </g>
        <text x="82" y="54" fontFamily="Arial, Helvetica, sans-serif" fontSize="28" fontWeight="700" fill="#ffffff" letterSpacing="-0.5">
          Laundro<tspan className="logo-cfo">CFO</tspan>
        </text>
      </svg>
    </Link>
  )
}
