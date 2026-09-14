import React from 'react';

export const StatCards: React.FC = () => {
  return (
    <div 
      id="compact-stat-cards" 
      className="w-full max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-6"
    >
      {/* 100B - TOTAL $WAZI SUPPLY */}
      <div className="rounded-2xl p-4 sm:p-5 bg-white border border-zinc-200/90 hover:border-zinc-300 transition-all text-center relative group shadow-xs hover:shadow-md">
        {/* Green line-art coin stack icon */}
        <div className="mx-auto w-7 h-7 mb-1.5 flex items-center justify-center text-[#00c805]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <ellipse cx="12" cy="6" rx="8" ry="3" />
            <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
            <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
          </svg>
        </div>
        <div className="font-display font-black text-2xl sm:text-3xl text-zinc-950 tracking-tight">
          100B
        </div>
        <div className="text-[11px] font-mono-code font-bold uppercase tracking-wider text-zinc-900 mt-1">
          TOTAL $WAZI SUPPLY
        </div>
        <div className="text-[11px] font-mono-code text-zinc-500 mt-0.5">
          Fixed max supply
        </div>
      </div>

      {/* 30B - SEASON 01 ALLOCATION */}
      <div className="rounded-2xl p-4 sm:p-5 bg-white border border-zinc-200/90 hover:border-[#00c805]/40 transition-all text-center relative group shadow-xs hover:shadow-md">
        {/* Green line-art cube icon */}
        <div className="mx-auto w-7 h-7 mb-1.5 flex items-center justify-center text-[#00c805]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </div>
        <div className="font-display font-black text-2xl sm:text-3xl text-zinc-950 tracking-tight">
          30B
        </div>
        <div className="text-[11px] font-mono-code font-bold uppercase tracking-wider text-[#00c805] mt-1">
          SEASON 01 ALLOCATION
        </div>
        <div className="text-[11px] font-mono-code text-zinc-500 mt-0.5">
          30% of total supply
        </div>
      </div>

      {/* 30% - SEASON 01 */}
      <div className="rounded-2xl p-4 sm:p-5 bg-white border border-zinc-200/90 hover:border-[#00c805]/40 transition-all text-center relative group shadow-xs hover:shadow-md">
        {/* Green line-art pie chart icon */}
        <div className="mx-auto w-7 h-7 mb-1.5 flex items-center justify-center text-[#00c805]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3v9l6 3" />
          </svg>
        </div>
        <div className="font-display font-black text-2xl sm:text-3xl text-zinc-950 tracking-tight">
          30%
        </div>
        <div className="text-[11px] font-mono-code font-bold uppercase tracking-wider text-[#00c805] mt-1">
          SEASON 01
        </div>
        <div className="text-[11px] font-mono-code text-zinc-500 mt-0.5">
          Community distribution
        </div>
      </div>
    </div>
  );
};
