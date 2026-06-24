"use client";

import { useState } from "react";
import clsx from "clsx";

export type OccupancyType = "leased" | "owner_occupied";

type Props = {
  saving: boolean;
  onSelect: (type: OccupancyType) => Promise<void>;
};

const OPTIONS: {
  type: OccupancyType;
  title: string;
  description: string;
  emoji: string;
}[] = [
  {
    type: "leased",
    title: "Leased Location",
    description: "Tenant leases from a third-party landlord",
    emoji: "📋",
  },
  {
    type: "owner_occupied",
    title: "Owner-Occupied / Related-Party Real Estate",
    description: "Owner owns the building",
    emoji: "🏢",
  },
];

export function OccupancySelector({ saving, onSelect }: Props) {
  const [hovered, setHovered] = useState<OccupancyType | null>(null);

  return (
    <div className="card max-w-3xl mx-auto">
      <h2 className="text-[16px] font-semibold text-slate-100 text-center mb-1">
        How does this laundromat occupy its space?
      </h2>
      <p className="text-slate-500 text-[13px] text-center mb-6">
        This determines which occupancy module we show — lease analysis or real estate ownership.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {OPTIONS.map((opt) => (
          <button
            key={opt.type}
            type="button"
            disabled={saving}
            onClick={() => onSelect(opt.type)}
            onMouseEnter={() => setHovered(opt.type)}
            onMouseLeave={() => setHovered(null)}
            className={clsx(
              "card2 text-left p-6 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              hovered === opt.type
                ? "border-blue-500/40 bg-blue-500/5"
                : "hover:border-white/20 hover:bg-white/[0.02]"
            )}
          >
            <div className="text-2xl mb-3">{opt.emoji}</div>
            <div className="text-[14px] font-semibold text-slate-100 mb-1.5">{opt.title}</div>
            <p className="text-[12px] text-slate-500 leading-relaxed">{opt.description}</p>
          </button>
        ))}
      </div>

      {saving && (
        <p className="text-center text-slate-500 text-[12px] mt-4">Saving selection...</p>
      )}
    </div>
  );
}
