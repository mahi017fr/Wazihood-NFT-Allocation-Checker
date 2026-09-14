import React from 'react';

export const CommunitySection: React.FC = () => {
  return (
    <section 
      id="community-section"
      className="w-full max-w-5xl mx-auto my-12 px-4 select-none"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* LEFT COLUMN: Polaroid Photos & Real Stories Doodles */}
        <div className="lg:col-span-4 flex flex-col items-center sm:items-start relative">
          <div className="relative w-full max-w-[280px] h-[320px]">
            
            {/* Top Polaroid (Replaced Wojak) */}
            <div className="absolute top-0 left-2 w-40 bg-white p-2.5 pb-6 rounded shadow-md border border-zinc-200 transform -rotate-6 hover:rotate-0 transition-transform duration-300 z-10">
              {/* Green Tape */}
              <div className="absolute -top-3 left-6 px-3 py-0.5 bg-[#4ade80]/90 text-zinc-900 font-marker text-[10px] tracking-wide transform -rotate-2 shadow-xs">
                Wazihood
              </div>
              
              {/* Inner Photo */}
              <div className="w-full aspect-square bg-white rounded-xs flex items-center justify-center overflow-hidden border border-zinc-200">
                <img 
                  src="/images/wazi_hoodie_wojak_1789326141976.jpg"
                  alt="Wazihood Community Wojak"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain filter contrast-105"
                />
              </div>
            </div>

            {/* Green Smiley Doodle beside top polaroid */}
            <div className="absolute top-10 right-4 flex items-center justify-center">
              <svg viewBox="0 0 50 50" className="w-9 h-9 text-[#00c805] stroke-current" fill="none" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="25" cy="25" r="20" strokeDasharray="3,1" />
                <circle cx="18" cy="20" r="2.5" fill="currentColor" />
                <circle cx="32" cy="20" r="2.5" fill="currentColor" />
                <path d="M 16 30 Q 25 38 34 30" />
              </svg>
            </div>

            {/* Bottom Polaroid (Classic Wojak) */}
            <div className="absolute top-28 left-16 w-44 bg-white p-2.5 pb-6 rounded shadow-lg border border-zinc-200 transform rotate-4 hover:rotate-0 transition-transform duration-300 z-20">
              {/* White/Paper Note attached with pin */}
              <div className="absolute -bottom-4 -left-4 bg-zinc-50 border border-zinc-200 px-2.5 py-1 text-[11px] font-handwriting font-bold text-zinc-800 shadow-xs transform -rotate-3">
                Community Driven
              </div>

              {/* Inner Photo */}
              <div className="w-full aspect-square bg-zinc-100 rounded-xs flex items-center justify-center overflow-hidden border border-zinc-200">
                <img 
                  src="/images/wazi_hero_left_1789325446988.jpg"
                  alt="Classic Wojak Community Member"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain filter contrast-110"
                />
              </div>
            </div>

            {/* Handwritten label on the side */}
            <div className="absolute bottom-8 -right-2 font-handwriting text-xs sm:text-sm font-bold text-zinc-700 leading-tight transform rotate-2">
              REAL<br />PEOPLE<br />REAL<br />STORIES.
            </div>

          </div>
        </div>

        {/* MIDDLE COLUMN: BUILT BY THE COMMUNITY Manifesto */}
        <div className="lg:col-span-5 text-left space-y-4">
          <h2 className="font-display font-black text-xl sm:text-2xl text-zinc-950 tracking-tight uppercase">
            BUILT BY THE COMMUNITY
          </h2>

          <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed font-normal">
            Wazihood is more than just a token. It’s a movement. 
            A community of real people who find meaning in the simple things. 
            $WAZI is for those who stayed, who hold, who believe, and who see a brighter tomorrow.
          </p>

          {/* Quote with Green Brush Stroke */}
          <div className="pt-2 relative inline-block">
            <span className="font-handwriting text-lg sm:text-xl font-bold text-zinc-900 tracking-wide block italic">
              “SAME FEELINGS, NEW OPPORTUNITIES.”
            </span>
            {/* Green Brush Stroke under quote */}
            <svg 
              className="w-full h-3 text-[#00c805] mt-0.5 overflow-visible" 
              viewBox="0 0 200 12" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                d="M 5 6 C 50 3, 150 2, 195 7" 
                stroke="currentColor" 
                strokeWidth="4" 
                strokeLinecap="round" 
              />
            </svg>
          </div>
        </div>

        {/* RIGHT COLUMN: Night City Balcony Scene with STILL HOLDING. */}
        <div className="lg:col-span-3 flex justify-center lg:justify-end">
          <div className="relative w-60 sm:w-64 aspect-[4/5] bg-zinc-950 rounded-xl overflow-hidden shadow-xl border-2 border-zinc-900 group">
            
            {/* Night City Illustration */}
            <img 
              src="/images/wazi_night_sky_1789325513353.jpg"
              alt="Wojak standing on balcony overlooking city at night"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover filter contrast-110"
            />

            {/* Green Sticky Note taped on top right: STILL HOLDING. */}
            <div className="absolute top-3 right-3 px-3 py-1 bg-[#4ade80] text-zinc-950 font-marker text-xs tracking-wider transform rotate-3 shadow-md border border-[#22c55e]">
              STILL<br />HOLDING.
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
