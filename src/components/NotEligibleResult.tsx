import React from 'react';
import { ArrowLeft, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { AllocationCheckResponse } from '../types';
import { formatNumber, truncateAddress } from '../utils/format';

interface NotEligibleResultProps {
  data: AllocationCheckResponse;
  openseaCollectionUrl: string;
  onReset: () => void;
}

export const NotEligibleResult: React.FC<NotEligibleResultProps> = ({ data, openseaCollectionUrl, onReset }) => {
  const formattedWalletAddress = truncateAddress(data.walletAddress, 6, 4);
  const holder = data.nftHolder;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 animate-in fade-in duration-300 select-none">
      {/* Top Floating Return Action Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onReset}
          className="inline-flex items-center space-x-2 text-xs font-mono-code text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer font-bold px-3 py-1.5 rounded-lg hover:bg-zinc-100"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>CHECK ANOTHER WALLET</span>
        </button>

        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-mono-code text-emerald-800 font-semibold shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-[#00c805] animate-pulse" />
          <span>Robinhood Chain Mainnet</span>
        </div>
      </div>

      {/* SECTION 1: HEADER */}
      <div className="text-center space-y-2 mt-10">
        <div className="text-xs font-mono-code font-bold tracking-[0.2em] text-zinc-500 uppercase">
          $WAZI · {data.season}
        </div>

        <h1 className="font-display font-black text-4xl sm:text-5xl md:text-6xl text-zinc-950 tracking-tight flex items-center justify-center flex-wrap gap-x-3 gap-y-1">
          <span>NOT</span>
          <span className="text-zinc-400">ELIGIBLE</span>
        </h1>

        <p className="text-xs sm:text-sm text-zinc-600 font-sans max-w-lg mx-auto pt-1">
          {data.reason || 'At least 1 Robinhood Chain transaction is required.'}
          <div className="w-44 h-1 bg-[#00c805]/70 rounded-full mx-auto mt-1.5" />
        </p>
      </div>

      {/* SECTION 2: RESULT CARD */}
      <div className="flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-4 relative pt-8">
        {/* LEFT FLANK: Relieved Wojak */}
        <div className="hidden lg:flex flex-col items-center justify-center w-[220px] xl:w-[250px] shrink-0 relative">
          <div className="relative w-full">
            <div className="absolute -top-6 left-2 font-handwriting text-sm xl:text-base font-bold text-zinc-800 leading-tight transform -rotate-12">
              SOON.
              <div className="absolute -right-7 top-4 flex flex-col space-y-1">
                <span className="w-4 h-0.5 bg-zinc-700 transform rotate-12" />
                <span className="w-5 h-0.5 bg-zinc-700" />
                <span className="w-4 h-0.5 bg-zinc-700 transform -rotate-12" />
              </div>
            </div>

            <img
              src="/src/assets/images/wazi_results_left_1789332144341.jpg"
              alt="Wojak still keeping hope"
              referrerPolicy="no-referrer"
              className="w-full h-auto object-contain mix-blend-multiply"
            />
          </div>
        </div>

        {/* CENTER: Not Eligible Card */}
        <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-zinc-200/90 shadow-xl text-center relative overflow-hidden">
          {/* Top Row: Wallet Address & Status */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
            <div className="text-left">
              <div className="flex items-center space-x-1.5 text-xs font-mono-code text-zinc-400 font-medium">
                <span>Wallet Address</span>
              </div>
              <div className="font-mono-code font-bold text-base text-zinc-900 mt-0.5">
                {formattedWalletAddress}
              </div>
            </div>

            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-zinc-50 border border-zinc-200 text-zinc-500 text-xs font-mono-code font-bold">
              <span className="w-2 h-2 rounded-full bg-zinc-400" />
              <span>Not Eligible</span>
            </div>
          </div>

          {/* Allocation Centerpiece */}
          <div className="py-6 text-center">
            <div className="text-[11px] font-mono-code font-bold uppercase tracking-widest text-zinc-400 mb-2">
              ALLOCATION
            </div>
            <div className="font-display font-black text-4xl sm:text-5xl tracking-tight leading-tight text-zinc-300">
              0 <span className="font-black text-zinc-300">$WAZI</span>
            </div>
            <div className="text-xs font-mono-code text-zinc-500 font-medium mt-2">
              At least 1 Robinhood Chain transaction is required.
            </div>
          </div>

          {/* Info Rows */}
          <div className="space-y-2 text-left my-2">
            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between">
              <div className="text-[9px] font-mono-code text-zinc-400 uppercase tracking-wider">Robinhood Transactions</div>
              <div className="text-xs font-bold text-zinc-900 flex items-center space-x-1">
                <span>{formatNumber(data.transactionCount)}</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between">
              <div className="text-[9px] font-mono-code text-zinc-400 uppercase tracking-wider">Wazi NFT</div>
              <div className="text-xs font-bold text-zinc-900 flex items-center space-x-1">
                {holder ? 'Holder' : 'Not a Holder'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between">
              <div className="text-[9px] font-mono-code text-zinc-400 uppercase tracking-wider">Eligibility</div>
              <div className="text-xs font-bold text-zinc-900">Not Eligible</div>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between">
              <div className="text-[9px] font-mono-code text-zinc-400 uppercase tracking-wider">Allocation</div>
              <div className="text-xs font-bold text-zinc-900">0 $WAZI</div>
            </div>
          </div>

          {/* Verified note */}
          <div className="mt-4 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-start space-x-2.5 text-left">
            <ShieldCheck className="w-4 h-4 text-[#00c805] shrink-0 mt-0.5" />
            <div className="text-[11px] text-zinc-700 leading-snug">
              Your wallet was successfully checked on Robinhood Chain. This result reflects your verified on-chain activity.
            </div>
          </div>

          {/* Reason */}
          <div className="mt-3 text-xs text-zinc-600 font-mono-code">
            <span className="font-bold text-zinc-900">Reason:</span> {data.reason || 'At least 1 Robinhood Chain transaction is required.'}
          </div>
        </div>

        {/* RIGHT FLANK: Victorious Wojak holding hope */}
        <div className="hidden lg:flex flex-col items-center justify-center w-[220px] xl:w-[250px] shrink-0 relative">
          <div className="relative w-full">
            <span className="absolute -top-6 right-2 font-handwriting text-xs xl:text-sm font-bold text-zinc-800 leading-tight transform rotate-6 text-right">
              NEXT<br />
              TIME,<br />
              TOO.
            </span>
            <img
              src="/src/assets/images/wazi_results_right_1789332158917.jpg"
              alt="Wojak celebrating the next opportunity"
              referrerPolicy="no-referrer"
              className="w-full h-auto object-contain mix-blend-multiply"
            />
          </div>
        </div>
      </div>

      {/* SECTION 3: NFT BONUS CTA */}
      <div className="mt-10 flex flex-col items-center text-center">
        {openseaCollectionUrl ? (
          <a
            href={openseaCollectionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-[#00c805] text-zinc-950 font-display font-bold text-sm sm:text-base uppercase tracking-wider hover:bg-[#00b004] active:scale-[0.99] transition-all shadow-sm shadow-[#00c805]/30 cursor-pointer space-x-2"
          >
            <span>GET A WAZI NFT</span>
            <ArrowUpRight className="w-4 h-4" />
          </a>
        ) : (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-[#00c805] text-zinc-950 font-display font-bold text-sm sm:text-base uppercase tracking-wider hover:bg-[#00b004] active:scale-[0.99] transition-all shadow-sm shadow-[#00c805]/30 cursor-pointer space-x-2"
          >
            <span>GET A WAZI NFT</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        )}

        <p className="text-xs sm:text-sm text-zinc-600 font-sans mt-3 max-w-md mx-auto">
          Get a Wazi NFT to add a bonus on top of your activity-based allocation.
        </p>
      </div>
    </div>
  );
};