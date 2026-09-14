import React from 'react';

interface NavbarProps {
  onHomeClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onHomeClick }) => {
  return (
    <header
      id="main-header"
      className="w-full pt-6 pb-2 px-4 sm:px-8 lg:px-12 relative z-20"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Wazihood Handwritten / Brush Branding */}
        <div 
          id="wazihood-logo" 
          onClick={onHomeClick}
          className="flex flex-col group cursor-pointer text-left"
        >
          <div className="relative inline-block">
            <span className="font-marker text-3xl sm:text-4xl text-zinc-950 tracking-wide inline-block transform -rotate-1 group-hover:opacity-90 transition-opacity">
              Wazihood
            </span>
            {/* Green hand-drawn brush underline */}
            <svg 
              className="absolute -bottom-1.5 left-0 w-full h-2.5 text-[#00c805] overflow-visible"
              viewBox="0 0 100 12" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                d="M2 9C25 5 65 3 98 8" 
                stroke="currentColor" 
                strokeWidth="3.5" 
                strokeLinecap="round" 
              />
            </svg>
          </div>
          <span className="text-[10px] font-mono-code uppercase tracking-[0.22em] text-zinc-800 font-bold mt-1">
            THE WAZI UNIVERSE
          </span>
        </div>

        {/* Middle Navigation Menu: Pure text links sitting directly on background, extra wide spacing, light silver & thin font */}
        <nav 
          id="navbar-middle-menu"
          aria-label="Main Navigation"
          className="flex items-center space-x-12 sm:space-x-20 md:space-x-24 lg:space-x-28"
        >
          {/* 1. Home */}
          <button
            type="button"
            onClick={onHomeClick}
            className="text-xs sm:text-sm font-sans font-light tracking-widest text-zinc-400 hover:text-zinc-800 transition-colors cursor-pointer bg-transparent p-0 border-none"
          >
            Home
          </button>

          {/* 2. Opensea */}
          <a
            href="https://opensea.io/collection/wazihoodmint/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs sm:text-sm font-sans font-light tracking-widest text-zinc-400 hover:text-zinc-800 transition-colors bg-transparent p-0"
          >
            Opensea
          </a>

          {/* 3. twitter */}
          <a
            href="https://x.com/WaziHood"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs sm:text-sm font-sans font-light tracking-widest text-zinc-400 hover:text-zinc-800 transition-colors bg-transparent p-0"
          >
            twitter
          </a>
        </nav>

        {/* LIVE Pill Badge with green dot */}
        <div 
          id="live-badge"
          className="hidden sm:inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-white border border-zinc-200 text-xs font-mono-code text-zinc-800 shadow-xs hover:border-zinc-300 transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-[#00c805]" />
          <span className="font-medium text-[11px] sm:text-xs">LIVE</span>
        </div>
      </div>
    </header>
  );
};
