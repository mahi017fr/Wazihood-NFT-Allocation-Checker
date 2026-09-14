import React from 'react';

export const WojakLineupBanner: React.FC = () => {
  return (
    <div className="w-full max-w-5xl mx-auto my-12 px-4 select-none">
      {/* Horizontal Lineup of Wojaks with Annotations */}
      <div className="relative w-full rounded-2xl bg-white overflow-hidden py-4">
        
        {/* Hand-written text callouts above characters */}
        <div className="relative w-full h-auto min-h-[140px] sm:min-h-[170px] flex items-end justify-between px-2 sm:px-6">
          
          {/* 1. Thoughtful looking left */}
          <div className="relative flex flex-col items-center group">
            <span className="absolute -top-7 left-2 font-handwriting text-xs sm:text-sm font-bold text-zinc-700 whitespace-nowrap transform -rotate-6">
              SAME<br />FEELINGS.
            </span>
            <div className="w-16 sm:w-24 h-24 sm:h-32 flex items-end justify-center">
              <svg viewBox="0 0 100 120" className="w-full h-full text-zinc-900" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {/* Classic Wojak head looking left */}
                <path d="M 75 110 C 70 85 65 60 55 45 C 50 35 45 20 30 20 C 15 20 10 32 10 48 C 10 65 15 80 20 110" />
                <path d="M 30 20 C 45 15 65 22 70 38 C 75 52 75 80 80 110" />
                {/* Sad eye looking left */}
                <ellipse cx="25" cy="46" rx="6" ry="4" fill="currentColor" />
                <path d="M 18 40 Q 28 35 34 40" strokeWidth="2.5" />
                {/* Furrowed brow */}
                <path d="M 15 32 Q 28 27 38 31" />
                <path d="M 20 27 Q 30 24 38 27" />
                {/* Nose & Mouth */}
                <path d="M 18 48 Q 12 56 16 62 Q 22 62 25 60" />
                <path d="M 16 74 Q 24 72 32 76" />
                <path d="M 18 84 Q 24 82 28 84" />
                {/* Ear */}
                <path d="M 68 50 Q 75 52 72 62 Q 68 68 64 64" />
              </svg>
            </div>
          </div>

          {/* 2. Headphone Wojak with music notes */}
          <div className="relative flex flex-col items-center group">
            <span className="absolute -top-6 right-0 font-mono-code text-sm text-zinc-700 animate-bounce">
              ♫
            </span>
            <span className="absolute -top-9 left-1 font-mono-code text-xs text-zinc-500">
              ♪
            </span>
            <div className="w-16 sm:w-24 h-24 sm:h-32 flex items-end justify-center">
              <svg viewBox="0 0 100 120" className="w-full h-full text-zinc-900" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {/* Head */}
                <path d="M 25 110 C 25 75 25 50 30 35 C 38 18 62 18 70 35 C 75 50 75 75 75 110" />
                {/* Headphones Band */}
                <path d="M 22 45 C 20 15 80 15 78 45" strokeWidth="3.5" />
                {/* Headphone Cups */}
                <rect x="16" y="42" width="10" height="22" rx="4" fill="currentColor" />
                <rect x="74" y="42" width="10" height="22" rx="4" fill="currentColor" />
                {/* Peaceful closed eyes */}
                <path d="M 38 48 Q 45 52 52 48" strokeWidth="2.5" />
                <path d="M 36 42 Q 44 38 52 41" />
                {/* Nose & calm mouth */}
                <path d="M 45 49 L 43 60 L 48 61" />
                <path d="M 40 73 Q 48 75 56 73" />
              </svg>
            </div>
          </div>

          {/* 3. Thoughtful with NEW OPPORTUNITIES. */}
          <div className="relative flex flex-col items-center group">
            <span className="absolute -top-7 -left-4 font-handwriting text-xs sm:text-sm font-bold text-zinc-700 whitespace-nowrap transform rotate-3">
              NEW<br />OPPORTUNITIES.
            </span>
            <div className="w-16 sm:w-24 h-24 sm:h-32 flex items-end justify-center">
              <svg viewBox="0 0 100 120" className="w-full h-full text-zinc-900" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {/* Face looking slightly right */}
                <path d="M 25 110 C 25 80 30 50 40 30 C 50 15 75 20 80 40 C 85 60 85 85 85 110" />
                <path d="M 40 45 Q 48 42 56 46" strokeWidth="2.5" />
                <ellipse cx="48" cy="48" rx="4" ry="3" fill="currentColor" />
                <path d="M 62 45 Q 68 42 74 46" strokeWidth="2.5" />
                <ellipse cx="68" cy="48" rx="4" ry="3" fill="currentColor" />
                <path d="M 58 48 L 56 62 L 62 63" />
                <path d="M 50 76 Q 60 74 68 76" />
                {/* Ear */}
                <path d="M 28 52 Q 22 55 24 64 Q 28 68 32 64" />
              </svg>
            </div>
          </div>

          {/* 4. Wojak in Beanie Hat */}
          <div className="relative flex flex-col items-center group">
            <div className="w-16 sm:w-24 h-24 sm:h-32 flex items-end justify-center">
              <svg viewBox="0 0 100 120" className="w-full h-full text-zinc-900" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {/* Beanie Hat */}
                <path d="M 22 42 C 22 18 78 18 78 42 Z" fill="#e4e4e7" stroke="currentColor" strokeWidth="2.5" />
                {/* Beanie Ribbing */}
                <path d="M 20 42 L 80 42 L 78 49 L 22 49 Z" fill="#d4d4d8" stroke="currentColor" strokeWidth="2" />
                <line x1="30" y1="26" x2="30" y2="42" />
                <line x1="42" y1="20" x2="42" y2="42" />
                <line x1="55" y1="20" x2="55" y2="42" />
                <line x1="68" y1="26" x2="68" y2="42" />
                {/* Face & Cheeks */}
                <path d="M 25 49 C 25 75 28 90 28 110" />
                <path d="M 75 49 C 75 75 72 90 72 110" />
                <ellipse cx="38" cy="58" rx="4" ry="3" fill="currentColor" />
                <ellipse cx="62" cy="58" rx="4" ry="3" fill="currentColor" />
                <path d="M 48 59 L 46 70 L 52 71" />
                <path d="M 42 82 Q 50 84 58 82" />
              </svg>
            </div>
          </div>

          {/* 5. Cool Wojak with Sunglasses & Cigarette */}
          <div className="relative flex flex-col items-center group">
            <div className="w-16 sm:w-24 h-24 sm:h-32 flex items-end justify-center">
              <svg viewBox="0 0 100 120" className="w-full h-full text-zinc-900" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {/* Head */}
                <path d="M 25 110 C 20 75 25 40 40 25 C 55 15 78 20 80 45 C 82 70 80 90 80 110" />
                {/* Classic Cool Wayfarer Sunglasses */}
                <path d="M 32 46 L 52 46 L 48 58 L 36 58 Z" fill="currentColor" />
                <path d="M 58 46 L 76 46 L 72 58 L 62 58 Z" fill="currentColor" />
                <line x1="52" y1="48" x2="58" y2="48" strokeWidth="3" />
                <line x1="28" y1="46" x2="32" y2="46" strokeWidth="2.5" />
                {/* Nose & Smug Mouth */}
                <path d="M 54 58 L 52 68 L 57 69" />
                <path d="M 45 80 Q 56 78 65 77" />
                {/* Cigarette / Joint with smoke */}
                <line x1="62" y1="78" x2="80" y2="72" strokeWidth="3" />
                <path d="M 82 70 Q 86 64 84 60 Q 82 54 88 48" strokeWidth="1.5" strokeDasharray="2,2" />
              </svg>
            </div>
          </div>

          {/* 6. Wojak Sipping from WAZI Mug */}
          <div className="relative flex flex-col items-center group">
            <div className="w-16 sm:w-24 h-24 sm:h-32 flex items-end justify-center">
              <svg viewBox="0 0 100 120" className="w-full h-full text-zinc-900" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {/* Head */}
                <path d="M 28 110 C 25 70 30 35 45 25 C 60 15 80 25 80 50 C 80 75 78 95 78 110" />
                {/* Eyes looking down at mug */}
                <path d="M 42 46 Q 48 42 54 45" strokeWidth="2.2" />
                <ellipse cx="48" cy="49" rx="3.5" ry="2.5" fill="currentColor" />
                {/* Mug in front of mouth */}
                <rect x="52" y="66" width="30" height="26" rx="4" fill="white" stroke="currentColor" strokeWidth="2.5" />
                <path d="M 82 72 C 90 72 90 84 82 84" strokeWidth="2.5" />
                {/* WAZI on the mug */}
                <text x="56" y="83" fontFamily="monospace" fontSize="9" fontWeight="900" fill="currentColor">
                  WAZI
                </text>
              </svg>
            </div>
          </div>

          {/* 7. Looking at Moon & Birds with Backpack: A BRIGHTER TOMORROW. */}
          <div className="relative flex flex-col items-center group">
            {/* Flying birds */}
            <span className="absolute -top-7 right-8 text-[11px] text-zinc-700">
              ~ ~
            </span>
            {/* Crescent moon */}
            <svg viewBox="0 0 24 24" className="absolute -top-10 right-2 w-5 h-5 text-zinc-800 fill-zinc-900">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <span className="absolute -top-7 -right-4 font-handwriting text-xs sm:text-sm font-bold text-zinc-800 whitespace-nowrap transform -rotate-3 text-right">
              A<br />BRIGHTER<br />TOMORROW.
            </span>
            <div className="w-16 sm:w-24 h-24 sm:h-32 flex items-end justify-center">
              <svg viewBox="0 0 100 120" className="w-full h-full text-zinc-900" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {/* Back of Head looking towards the horizon */}
                <path d="M 40 110 C 35 75 35 45 42 32 C 50 18 70 18 78 32 C 82 45 80 75 75 110" />
                {/* Ear side profile */}
                <path d="M 75 46 Q 80 50 78 58 Q 75 62 72 58" />
                {/* Jacket Collar / Backpack Straps */}
                <path d="M 38 75 C 38 90 44 110 44 110" strokeWidth="3" />
                <path d="M 68 75 C 68 90 62 110 62 110" strokeWidth="3" />
                {/* Backpack Bulk */}
                <path d="M 32 82 C 24 88 26 110 34 110" strokeWidth="2.5" />
              </svg>
            </div>
          </div>

        </div>

        {/* Milestone Timeline Progress Line */}
        <div className="relative w-full max-w-4xl mx-auto px-4 mt-2">
          <div className="h-[2px] w-full bg-zinc-200 relative flex items-center justify-between">
            {/* Node 1 */}
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-300 border-2 border-white shadow-xs" />
            {/* Node 2 */}
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-300 border-2 border-white shadow-xs" />
            {/* Node 3 */}
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-300 border-2 border-white shadow-xs" />
            {/* Node 4 (Active / highlighted green!) */}
            <div className="w-3.5 h-3.5 rounded-full bg-[#00c805] border-2 border-white shadow-xs ring-2 ring-[#00c805]/30" />
            {/* Node 5 */}
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-300 border-2 border-white shadow-xs" />
            {/* Node 6 */}
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-300 border-2 border-white shadow-xs" />
            {/* Node 7 */}
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-300 border-2 border-white shadow-xs" />
          </div>
        </div>

      </div>
    </div>
  );
};
