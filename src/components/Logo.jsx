import Link from 'next/link'

export default function Logo() {
  return (
    <Link href="/portfolio" className="inline-block hover:opacity-90 transition-opacity">
      <svg width="180" viewBox="0 0 360 84" role="img" xmlns="http://www.w3.org/2000/svg">
        <title>LaundroCFO</title>
        <defs>
          <clipPath id="porthole-clip">
            <circle cx="43" cy="44" r="14" />
          </clipPath>
          <style>{`
            .c { fill: none; stroke: #7ecba1; }
            .f { fill: #7ecba1; }
            .t { fill: #7ecba1; }
            @media (prefers-color-scheme: dark) {
              .c { stroke: #5b9ef5; }
              .f { fill: #5b9ef5; }
              .t { fill: #5b9ef5; }
            }
            .bar { transform-origin: bottom; animation: gb 0.6s cubic-bezier(0.22,1,0.36,1) both; }
            .b1 { animation-delay: 0.10s; }
            .b2 { animation-delay: 0.22s; }
            .b3 { animation-delay: 0.34s; }
            .b4 { animation-delay: 0.46s; }
            @keyframes gb { from { transform: scaleY(0); } to { transform: scaleY(1); } }
          `}</style>
        </defs>
        <rect className="c" x="16" y="8" width="54" height="68" rx="5" strokeWidth="2.2" />
        <line className="c" x1="16" y1="22" x2="70" y2="22" strokeWidth="1.4" />
        <circle className="c" cx="26" cy="15" r="2.4" strokeWidth="1.4" />
        <circle className="c" cx="36" cy="15" r="2.4" strokeWidth="1.4" />
        <circle className="c" cx="43" cy="44" r="20" strokeWidth="2" />
        <circle className="c" cx="43" cy="44" r="15" strokeWidth="1" opacity="0.4" />
        <g clipPath="url(#porthole-clip)">
          <rect className="bar b1 f" x="30" y="52" width="6" height="8" rx="1" />
          <rect className="bar b2 f" x="38" y="45" width="6" height="15" rx="1" />
          <rect className="bar b3 f" x="46" y="38" width="6" height="22" rx="1" />
          <rect className="bar b4 f" x="54" y="41" width="6" height="19" rx="1" />
        </g>
        <text className="t" x="82" y="58" fontFamily="Arial, Helvetica, sans-serif" fontSize="38" fontWeight="700" letterSpacing="-0.5">LaundroCFO</text>
      </svg>
    </Link>
  )
}
