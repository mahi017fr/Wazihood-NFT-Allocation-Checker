import React from 'react';

interface FooterProps {
  doodleText?: string;
}

export const Footer: React.FC<FooterProps> = ({ doodleText = 'A BRIGHTER\nTOMORROW.' }) => {
  return (
    <footer 
      id="main-footer"
      className="w-full py-8 mt-12 border-t border-zinc-100 bg-white relative z-10 select-none"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        
        {/* LEFT: Wazihood with Green Underline */}
        <div className="flex flex-col items-center md:items-start">
          <div className="relative inline-block">
            <span className="font-marker text-2xl text-zinc-950 tracking-wide inline-block transform -rotate-1">
              Wazihood
            </span>
            {/* Green hand-drawn brush underline */}
            <svg 
              className="absolute -bottom-1 left-0 w-full h-2 text-[#00c805] overflow-visible"
              viewBox="0 0 100 12" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                d="M2 8C25 4 65 3 98 7" 
                stroke="currentColor" 
                strokeWidth="3" 
                strokeLinecap="round" 
              />
            </svg>
          </div>
          <span className="text-[9px] font-mono-code uppercase tracking-[0.22em] text-zinc-600 font-bold mt-1">
            THE WAZI UNIVERSE
          </span>
        </div>

        {/* CENTER: Navigation Links */}
        <div className="flex items-center space-x-3 text-xs font-mono-code text-zinc-600">
          <span className="hover:text-zinc-900 cursor-pointer transition-colors">$WAZI</span>
          <span className="text-zinc-300">•</span>
          <span className="hover:text-zinc-900 cursor-pointer transition-colors">Community</span>
        </div>

        {/* RIGHT: Social Icons & A BRIGHTER TOMORROW Doodle */}
        <div className="flex items-center space-x-6">
          {/* Social icons: X */}
          <div className="flex items-center space-x-4 text-zinc-800">
            {/* X / Twitter */}
            <a 
              href="https://x.com" 
              target="_blank" 
              rel="noreferrer"
              className="hover:text-black transition-colors"
              aria-label="X Twitter"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>

          {/* Handwritten Doodle */}
          <div className="relative font-handwriting text-xs sm:text-sm font-bold text-zinc-800 transform -rotate-3 text-right whitespace-pre-line">
            {doodleText}
            <div className="w-12 h-1 bg-[#00c805]/40 rounded-full mx-auto mt-0.5" />
          </div>
        </div>

      </div>
    </footer>
  );
};
