import React from 'react';
import { ArrowRight, Wallet, Clipboard, Info, ShieldCheck, Activity, Coins } from 'lucide-react';
import { StatCards } from './StatCards';

interface HeroProps {
  walletInput: string;
  setWalletInput: (val: string) => void;
  onSubmit: (address: string) => void;
  isScanning: boolean;
}

export const Hero: React.FC<HeroProps> = ({
  walletInput,
  setWalletInput,
  onSubmit,
  isScanning
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (walletInput.trim()) {
      onSubmit(walletInput.trim());
    }
  };

  const handlePaste = async () => {
    try {
      if (navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setWalletInput(text.trim());
        }
      }
    } catch {
      // Browser clipboard fallback
    }
  };

  return (
    <section 
      id="hero-checker-section" 
      className="relative w-full pt-4 pb-12 px-4 sm:px-6 lg:px-8 select-none"
    >
      <div className="max-w-6xl mx-auto w-full relative">
        
        {/* TOP CENTER HEADLINE */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          {/* Subtitle: $WAZI · ROBINHOOD CHAIN */}
          <div className="text-xs sm:text-sm font-mono-code font-bold uppercase tracking-[0.25em] text-zinc-900 mb-3">
            $WAZI &nbsp;·&nbsp; ROBINHOOD CHAIN
          </div>

          {/* Main Headline: YOUR $WAZI ALLOCATION AWAITS. */}
          <h1 
            id="hero-main-heading"
            className="font-display text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-zinc-950 leading-[1.08] uppercase mb-4"
          >
            YOUR <span className="text-[#00c805]">$WAZI</span> <br />
            ALLOCATION AWAITS.
          </h1>

          {/* Descriptive text */}
          <p 
            id="hero-supporting-text"
            className="text-xs sm:text-sm text-zinc-600 font-normal leading-relaxed max-w-lg mx-auto"
          >
            Enter your wallet address to check your estimated $WAZI allocation based on your on-chain activity. Wazi NFT holders receive a bonus on top.
          </p>
        </div>

        {/* HERO COMPOSITION: LEFT CHARACTER + CENTER CARD + RIGHT CHARACTERS */}
        <div className="relative flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-4 my-4">
          
          {/* LEFT: Oversized Pensive Wojak Character */}
          <div className="hidden lg:flex flex-col items-center justify-start w-[240px] xl:w-[280px] shrink-0 -mt-8">
            <div className="relative w-full">
              <img
                src="/images/wazi_hero_left_1789325446988.jpg"
                alt="Wojak still believing"
                referrerPolicy="no-referrer"
                className="w-full h-auto object-contain filter contrast-105 mix-blend-multiply"
              />
              {/* Handwritten text below character: SAME PEOPLE STILL BELIEVING. */}
              <div className="font-handwriting text-base xl:text-lg font-bold text-zinc-800 tracking-wide mt-2 text-left leading-tight transform -rotate-3 pl-2">
                SAME<br />
                PEOPLE<br />
                STILL<br />
                BELIEVING.
              </div>
            </div>
          </div>

          {/* CENTER: CHECK YOUR ALLOCATION CARD */}
          <div className="w-full max-w-lg mx-auto z-10">
            <div 
              id="main-wallet-checker-card"
              className="relative rounded-3xl p-6 sm:p-7 bg-white border border-zinc-200/90 shadow-xl shadow-zinc-200/50 text-left"
            >
              {/* Card Header: Title + Robinhood Network Pill */}
              <div className="flex items-center justify-between gap-2 mb-6">
                <h2 className="font-display text-base sm:text-lg font-black text-zinc-950 tracking-tight uppercase">
                  CHECK YOUR ALLOCATION
                </h2>

                <div 
                  id="robinhood-network-indicator"
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white border border-zinc-200 text-xs font-mono-code text-zinc-700 shadow-xs"
                >
                  <span className="w-2 h-2 rounded-full bg-[#00c805]" />
                  <span className="font-medium text-[11px]">Robinhood Chain</span>
                </div>
              </div>

              {/* Form Input + Full Width Green Button */}
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* Input with Wallet Icon and Paste Button inside */}
                <div className="relative flex items-center rounded-xl bg-white border border-zinc-300 px-3 py-1 focus-within:border-[#00c805] focus-within:ring-2 focus-within:ring-[#00c805]/20 transition-all shadow-xs">
                  <Wallet className="w-4 h-4 text-zinc-400 shrink-0 mr-2.5" />
                  
                  <input
                    id="hero-wallet-input"
                    type="text"
                    value={walletInput}
                    onChange={(e) => setWalletInput(e.target.value)}
                    placeholder="Enter your wallet address (0x...)"
                    className="w-full bg-transparent py-2.5 pr-2 text-xs sm:text-sm font-mono-code text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                    disabled={isScanning}
                  />

                  <div className="shrink-0 flex items-center">
                    {walletInput ? (
                      <button
                        type="button"
                        onClick={() => setWalletInput('')}
                        className="px-2 py-0.5 text-zinc-400 hover:text-zinc-700 text-xs font-mono-code cursor-pointer"
                        title="Clear"
                      >
                        CLEAR
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePaste}
                        className="px-2.5 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-[11px] font-mono-code font-bold uppercase transition-colors cursor-pointer border border-zinc-200"
                        title="Paste"
                      >
                        PASTE
                      </button>
                    )}
                  </div>
                </div>

                {/* Big Vibrant Solid Green Button: CHECK ALLOCATION → */}
                <button
                  id="hero-check-button"
                  type="submit"
                  disabled={isScanning || !walletInput.trim()}
                  className="w-full py-3.5 px-6 rounded-xl bg-[#00c805] hover:bg-[#00b004] active:scale-[0.99] font-display font-bold text-xs sm:text-sm uppercase tracking-wider text-white shadow-sm shadow-[#00c805]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {isScanning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>VERIFYING ON ROBINHOOD...</span>
                    </>
                  ) : (
                    <>
                      <span>CHECK ALLOCATION</span>
                      <ArrowRight className="w-4 h-4 text-white" />
                    </>
                  )}
                </button>
              </form>

              {/* Notice: No wallet connection required. */}
              <div className="flex items-center justify-center space-x-1.5 text-xs font-mono-code text-zinc-600 mt-3.5 mb-5">
                <Info className="w-3.5 h-3.5 text-zinc-700 shrink-0" />
                <span>No wallet connection required.</span>
              </div>

              {/* How eligibility works */}
              <div className="pt-4 border-t border-zinc-100 font-mono-code">
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-2.5">
                  HOW ELIGIBILITY WORKS
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-200 hover:border-zinc-300 transition-all shadow-2xs">
                    <div className="flex items-center space-x-1.5 text-[#00c805] mb-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold text-zinc-900">ACTIVE WALLET</span>
                    </div>
                    <div className="text-[10px] text-zinc-600 font-medium leading-snug">
                      At least 1 Robinhood Chain transaction is required for eligibility.
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-200 hover:border-zinc-300 transition-all shadow-2xs">
                    <div className="flex items-center space-x-1.5 text-[#00c805] mb-1">
                      <Activity className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold text-zinc-900">ON-CHAIN ACTIVITY</span>
                    </div>
                    <div className="text-[10px] text-zinc-600 font-medium leading-snug">
                      Robinhood Chain transactions build your activity score up to 100 points.
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-200 hover:border-zinc-300 transition-all shadow-2xs">
                    <div className="flex items-center space-x-1.5 text-[#00c805] mb-1">
                      <Coins className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold text-zinc-900">WAZI NFT BONUS</span>
                    </div>
                    <div className="text-[10px] text-zinc-600 font-medium leading-snug">
                      Optional. Holding a Wazi NFT adds a bonus on top of your activity allocation.
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* RIGHT: Headphone Wojak + Sticky Note + Computer Desk Wojak */}
          <div className="hidden lg:flex flex-col items-center justify-between w-[240px] xl:w-[270px] shrink-0 space-y-4">
            
            {/* Top Right: Confident Wojak Character */}
            <div className="relative w-full flex items-center justify-center">
              <div className="relative w-36 xl:w-40">
                <span className="absolute -top-3 -left-6 font-handwriting text-xs xl:text-sm font-bold text-zinc-800 leading-tight transform -rotate-6">
                  GOOD<br />PEOPLE<br />HOLD<br />LONGER
                </span>
                <span className="absolute top-2 -right-2 text-sm font-mono-code text-zinc-700">
                  ✦
                </span>
                <img
                  src="/images/wazi_confident_wojak_1789326265753.jpg"
                  alt="Confident Wojak"
                  referrerPolicy="no-referrer"
                  className="w-full h-auto object-contain mix-blend-multiply"
                />
              </div>
            </div>

            {/* Slanted Green Sticky Note: JUST A GUY WHO BELIEVES. */}
            <div className="relative py-1">
              <div className="px-4 py-2.5 bg-[#86efac] text-zinc-950 font-handwriting text-sm xl:text-base font-black tracking-wide transform rotate-6 shadow-md border border-[#4ade80] rounded-xs">
                JUST<br />A GUY<br />WHO<br />BELIEVES.
              </div>
            </div>

            {/* Bottom Right: Wojak at computer desk with WAZI mug */}
            <div className="relative w-full flex items-center justify-center">
              <div className="relative w-36 xl:w-40">
                <span className="absolute -top-4 right-0 font-handwriting text-xs xl:text-sm font-bold text-zinc-800 leading-tight transform rotate-3">
                  MORE<br />THAN<br />JUST<br />A MEME
                </span>
                <img
                  src="/images/wazi_desk_1789325482918.jpg"
                  alt="Wojak typing at computer with WAZI coffee mug"
                  referrerPolicy="no-referrer"
                  className="w-full h-auto object-contain mix-blend-multiply"
                />
              </div>
            </div>

          </div>

        </div>

        {/* 3 STAT CARDS: 1B, 300M, 30% */}
        <StatCards />

      </div>
    </section>
  );
};
