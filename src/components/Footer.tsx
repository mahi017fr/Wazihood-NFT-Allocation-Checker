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
          {/* Social icons: X, Discord, Telegram */}
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

            {/* Discord */}
            <a 
              href="https://discord.com" 
              target="_blank" 
              rel="noreferrer"
              className="hover:text-[#5865F2] transition-colors"
              aria-label="Discord"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </a>

            {/* Telegram */}
            <a 
              href="https://t.me" 
              target="_blank" 
              rel="noreferrer"
              className="hover:text-[#229ED9] transition-colors"
              aria-label="Telegram"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
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
