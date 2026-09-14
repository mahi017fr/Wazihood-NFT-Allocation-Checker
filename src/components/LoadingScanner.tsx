import React from 'react';
import { ScannerStage } from '../types';

interface LoadingScannerProps {
  currentStage: ScannerStage;
  walletAddress: string;
}

export const LoadingScanner: React.FC<LoadingScannerProps> = ({ currentStage, walletAddress }) => {
  const stages: { key: ScannerStage; label: string }[] = [
    { key: 'scanning_wallet', label: 'SCANNING WALLET...' },
    { key: 'checking_nft', label: 'CHECKING NFT BONUS...' },
    { key: 'analyzing_activity', label: 'ANALYZING ACTIVITY...' },
    { key: 'calculating_allocation', label: 'CALCULATING $WAZI ALLOCATION...' }
  ];

  const getStageIndex = (stage: ScannerStage): number => {
    switch (stage) {
      case 'scanning_wallet': return 0;
      case 'checking_nft': return 1;
      case 'analyzing_activity': return 2;
      case 'calculating_allocation': return 3;
      case 'complete': return 4;
      default: return 0;
    }
  };

  const currentIndex = getStageIndex(currentStage);

  return (
    <div 
      id="loading-scanner-container"
      className="w-full max-w-lg mx-auto rounded-3xl p-8 bg-white border border-zinc-200 text-center relative overflow-hidden shadow-xl"
    >
      {/* Subtle emerald accent glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-emerald-100/60 blur-[60px] pointer-events-none -z-10" />

      {/* 4 Green Animated Dots Loading (as requested) */}
      <div className="relative mx-auto py-8 mb-4 flex items-center justify-center">
        {/* Subtle background glow */}
        <div className="absolute w-44 h-16 bg-[#00c805]/15 blur-2xl rounded-full pointer-events-none" />

        {/* 4 Dots in a horizontal line */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#00c805] shadow-[0_0_12px_rgba(0,200,5,0.6)] animate-dot-1" />
          <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#00c805] shadow-[0_0_12px_rgba(0,200,5,0.6)] animate-dot-2" />
          <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#00c805] shadow-[0_0_12px_rgba(0,200,5,0.6)] animate-dot-3" />
          <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#00c805] shadow-[0_0_12px_rgba(0,200,5,0.6)] animate-dot-4" />
        </div>
      </div>

      {/* Current Active Step Heading */}
      <div className="space-y-1 mb-8">
        <div className="text-[10px] font-mono-code font-bold uppercase tracking-widest text-[#00c805]">
          ● VERIFYING ON ROBINHOOD NETWORK
        </div>
        <h3 className="font-display text-xl sm:text-2xl font-black text-zinc-950 tracking-tight">
          {stages[Math.min(3, currentIndex)]?.label}
        </h3>
        <p className="text-xs font-mono-code text-zinc-500 truncate max-w-xs mx-auto mt-1">
          {walletAddress}
        </p>
      </div>

      {/* Minimalist Step Checklist */}
      <div className="space-y-2.5 max-w-sm mx-auto text-left font-mono-code text-xs">
        {stages.map((st, idx) => {
          const isFinished = currentIndex > idx;
          const isCurrent = currentIndex === idx;

          return (
            <div
              key={st.key}
              className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                isCurrent
                  ? 'bg-emerald-50/80 border-[#00c805]/40 text-zinc-950 font-bold shadow-xs'
                  : isFinished
                  ? 'bg-zinc-50 border-zinc-200 text-zinc-700'
                  : 'bg-transparent border-zinc-100 text-zinc-400'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                {isFinished ? (
                  <span className="w-2 h-2 rounded-full bg-[#00c805]" />
                ) : isCurrent ? (
                  <span className="w-2 h-2 rounded-full bg-[#00c805] animate-ping" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-zinc-300" />
                )}
                <span className={isCurrent ? 'font-bold text-zinc-900' : ''}>
                  {st.label}
                </span>
              </div>

              <span className="text-[10px] tracking-wider uppercase">
                {isFinished ? (
                  <span className="text-[#00c805] font-semibold">DONE</span>
                ) : isCurrent ? (
                  <span className="text-[#00c805] font-semibold">SCANNING</span>
                ) : (
                  <span className="text-zinc-400">WAITING</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
