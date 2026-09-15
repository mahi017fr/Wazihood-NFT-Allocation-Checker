import React, { useEffect, useState } from 'react';
import { AllocationCheckResponse, NetworkMetrics } from '../types';
import { formatAllocation, formatNumber, truncateAddress } from '../utils/format';
import { ArrowLeft, Copy, Check, Activity, Shield, Network, Coins, ArrowUpRight } from 'lucide-react';
import confetti from 'canvas-confetti';

interface ResultsDashboardProps {
  data: AllocationCheckResponse;
  onReset: () => void;
}

async function fetchNetworkMetrics(): Promise<NetworkMetrics | null> {
  try {
    const response = await fetch('/api/metrics');
    const payload = (await response.json()) as { success: boolean; data?: NetworkMetrics };
    if (payload && payload.success && payload.data) return payload.data;
  } catch {
    // metrics are optional UI context - never fabricated
  }
  return null;
}

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ data, onReset }) => {
  const [copied, setCopied] = useState(false);
  const [metrics, setMetrics] = useState<NetworkMetrics | null>(null);
  const eligible = data.eligible;

  useEffect(() => {
    if (!eligible) return;
    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.4 },
        colors: ['#00c805', '#10b981', '#34d399', '#059669', '#ffffff']
      });
    } catch {
      // Safe fallback
    }
  }, [eligible]);

  useEffect(() => {
    let mounted = true;
    fetchNetworkMetrics().then((m) => {
      if (mounted && m) setMetrics(m);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(data.walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formattedWalletAddress = truncateAddress(data.walletAddress, 6, 4);
  const finalAllocation = data.allocation;
  const activityAllocation = Math.max(0, finalAllocation - data.nftBonus);
  const totalScore = data.activityScore;
  const baseShare = finalAllocation > 0 ? (activityAllocation / finalAllocation) * 100 : 0;
  const bonusShare = finalAllocation > 0 ? (data.nftBonus / finalAllocation) * 100 : 0;

  const progressBar = (score: number, max: number) => {
    const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
    return (
      <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
        <div className="h-full bg-[#00c805] rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
    );
  };

  return (
    <div
      id="results-dashboard-full-view"
      className="w-full max-w-5xl mx-auto px-4 py-6 space-y-10 animate-in fade-in duration-300 select-none"
    >
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

      {/* SECTION 1: HEADER HEADLINE */}
      <div className="text-center space-y-2">
        <div className="text-xs font-mono-code font-bold tracking-[0.2em] text-zinc-500 uppercase">
          ${'WAZI'}
        </div>

        {/* ALLOCATION FOUND / NOT ELIGIBLE with 3 green radiating rays */}
        <h1 className="font-display font-black text-4xl sm:text-5xl md:text-6xl text-zinc-950 tracking-tight flex items-center justify-center flex-wrap gap-x-3 gap-y-1">
          <span>{eligible ? 'ALLOCATION' : 'NO ALLOCATION'}</span>
          <span className="text-[#00c805] relative inline-flex items-center">
            {eligible ? 'FOUND' : 'AVAILABLE'}
            {/* 3 Hand-drawn Green Radiating Rays */}
            <svg
              className="w-8 h-8 sm:w-10 sm:h-10 text-[#00c805] ml-1.5 -mt-3 shrink-0"
              viewBox="0 0 40 40"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
            >
              <path d="M8 32 L18 22" />
              <path d="M17 35 L22 18" />
              <path d="M30 30 L25 17" />
            </svg>
          </span>
        </h1>

        <div className="relative inline-block text-xs sm:text-sm text-zinc-600 font-sans max-w-lg mx-auto pt-1">
          {eligible
            ? 'Your $WAZI allocation based on verified Robinhood Chain transaction activity. Wazi NFT holders receive a bonus on top.'
            : 'At least 1 Robinhood Chain transaction is required for a $WAZI allocation.'}
          {/* Subtle green brush line */}
          <div className="w-44 h-1 bg-[#00c805]/70 rounded-full mx-auto mt-1.5" />
        </div>
      </div>

      {/* SECTION 2: HERO ALLOCATION ROW WITH FLANKING WOJAK CHARACTERS */}
      <div className="flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-4 relative pt-2">

        {/* LEFT FLANK: Relieved Emotional Wojak + IT WAS WORTH IT doodle */}
        <div className="hidden lg:flex flex-col items-center justify-center w-[220px] xl:w-[250px] shrink-0 relative">
          <div className="relative w-full">
            {/* Slanted Handwritten Text + 3 Radiating Rays */}
            <div className="absolute -top-6 left-2 font-handwriting text-sm xl:text-base font-bold text-zinc-800 leading-tight transform -rotate-12">
              {eligible ? 'IT WAS\nWORTH\nIT.' : 'STILL\nWAITING.'}
              {/* Radiating lines toward head */}
              <div className="absolute -right-7 top-4 flex flex-col space-y-1">
                <span className="w-4 h-0.5 bg-zinc-700 transform rotate-12" />
                <span className="w-5 h-0.5 bg-zinc-700" />
                <span className="w-4 h-0.5 bg-zinc-700 transform -rotate-12" />
              </div>
            </div>

            {/* Wojak Image */}
            <img
              src="/images/wazi_results_left_1789332144341.jpg"
              alt="Wojak Believer"
              referrerPolicy="no-referrer"
              className="w-full h-auto object-contain mix-blend-multiply"
            />
          </div>
        </div>

        {/* CENTER: Main Allocation Card */}
        <div
          id="allocation-result-card"
          className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-zinc-200/90 shadow-xl text-center relative overflow-hidden"
        >
          {/* Top Row: Wallet Address & Eligible Badge */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
            <div className="text-left">
              <div className="flex items-center space-x-1.5 text-xs font-mono-code text-zinc-400 font-medium">
                <span>Wallet Address</span>
                <button
                  onClick={handleCopy}
                  className="text-zinc-400 hover:text-zinc-800 transition-colors cursor-pointer"
                  title="Copy Address"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#00c805]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="font-mono-code font-bold text-base text-zinc-900 mt-0.5">
                {formattedWalletAddress}
              </div>
            </div>

            {/* Eligible Pill */}
            <div
              className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-mono-code font-bold ${
                eligible
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-zinc-50 border border-zinc-200 text-zinc-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${eligible ? 'bg-[#00c805]' : 'bg-zinc-400'}`} />
              <span>{eligible ? 'Eligible' : 'Not Eligible'}</span>
            </div>
          </div>

          {/* Allocation Centerpiece */}
          <div className="py-6 text-center">
            <div className="text-[11px] font-mono-code font-bold uppercase tracking-widest text-zinc-400 mb-2">
              {eligible ? 'FINAL ALLOCATION' : 'ALLOCATION'}
            </div>

            <div className={`font-display font-black text-4xl sm:text-5xl tracking-tight leading-tight ${eligible ? 'text-[#00c805]' : 'text-zinc-300'}`}>
              {formatAllocation(finalAllocation)}{' '}
              <span className={`font-black ${eligible ? 'text-[#00c805]' : 'text-zinc-300'}`}>$WAZI</span>
            </div>

            <div className="text-xs font-mono-code text-zinc-500 font-medium mt-2">
              {eligible
                ? data.allocationSource === 'snapshot'
                  ? 'Allocation snapshot · finalized'
                  : 'Allocation · newly calculated'
                : 'Not eligible for the allocation'}
            </div>
          </div>

          {/* 4 Metadata Pills Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left my-2">
            {/* ELIGIBILITY */}
            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 shadow-2xs">
              <div className="text-[9px] font-mono-code text-zinc-400 uppercase tracking-wider">
                ELIGIBILITY
              </div>
              <div className="text-xs font-bold text-zinc-900 mt-0.5 flex items-center space-x-1">
                <span className={eligible ? 'text-[#00c805]' : 'text-zinc-400'}>✓</span>
                <span>{eligible ? 'Eligible' : 'Not eligible'}</span>
              </div>
            </div>

            {/* TX COUNT */}
            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 shadow-2xs">
              <div className="text-[9px] font-mono-code text-zinc-400 uppercase tracking-wider">
                TX COUNT
              </div>
              <div className="text-xs font-bold text-zinc-900 mt-0.5 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00c805]" />
                <span>{formatNumber(data.transactionCount)}</span>
              </div>
            </div>

            {/* ACTIVITY SCORE */}
            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 shadow-2xs">
              <div className="text-[9px] font-mono-code text-zinc-400 uppercase tracking-wider">
                ACTIVITY SCORE
              </div>
              <div className="text-xs font-bold text-zinc-900 mt-0.5 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00c805]" />
                <span>{totalScore} / 100</span>
              </div>
            </div>

            {/* NETWORK */}
            <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 shadow-2xs">
              <div className="text-[9px] font-mono-code text-zinc-400 uppercase tracking-wider">
                NETWORK
              </div>
              <div className="text-xs font-bold text-zinc-900 mt-0.5 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00c805]" />
                <span>{data.network === 'Robinhood Chain' ? 'Robinhood' : data.network}</span>
              </div>
            </div>
          </div>

          {/* Bottom Alert / Banner */}
          <div
            className={`mt-5 p-3 rounded-xl flex items-center space-x-3 text-left ${
              eligible ? 'bg-emerald-50/70 border border-emerald-200' : 'bg-zinc-50 border border-zinc-200'
            }`}
          >
            <span className="text-xl">{eligible ? '🎉' : '🔒'}</span>
            <div className="text-xs">
              <div className="font-bold text-zinc-900">
                {eligible ? 'You are eligible!' : 'Not eligible.'}
              </div>
              <div className="text-[11px] text-zinc-500">
                {eligible
                  ? 'Each Wazi NFT you hold adds +9,000 $WAZI to your allocation.'
                  : data.reason || 'At least 1 Robinhood Chain transaction is required.'}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT FLANK: Victorious Wojak + Sticky Note + Text */}
        <div className="hidden lg:flex flex-col items-center justify-between w-[220px] xl:w-[250px] shrink-0 space-y-3 relative">
          {/* Victorious Wojak Image with STILL HERE. STILL WINNING. */}
          <div className="relative w-full">
            <span className="absolute -top-6 right-2 font-handwriting text-xs xl:text-sm font-bold text-zinc-800 leading-tight transform rotate-6 text-right">
              {eligible ? 'STILL\nHERE.\nSTILL\nWINNING.' : 'GOOD\nPEOPLE\nWAIT.\nWELL.'}
            </span>

            <img
              src="/images/wazi_results_right_1789332158917.jpg"
              alt="Victorious Wojak Celebrating"
              referrerPolicy="no-referrer"
              className="w-full h-auto object-contain mix-blend-multiply"
            />
          </div>

          {/* Slanted Green Sticky Note & GOOD PEOPLE HOLD LONGER */}
          <div className="flex items-center justify-between w-full pt-1">
            {/* Sticky Note */}
            <div className="px-3.5 py-2.5 bg-[#86efac] text-zinc-950 font-handwriting text-xs font-black tracking-wide transform -rotate-3 shadow-md border border-[#4ade80] rounded-xs text-left">
              SAME<br />
              PEOPLE.<br />
              NEW<br />
              OPPORTUNITIES.<br />
              <span className="text-sm">:)</span>
            </div>

            {/* Handwritten text */}
            <div className="font-handwriting text-xs xl:text-sm font-bold text-zinc-800 transform rotate-3 text-right leading-tight">
              GOOD<br />
              PEOPLE<br />
              HOLD<br />
              LONGER.
            </div>
          </div>
        </div>

      </div>

      {/* SECTION 3: 3 ANALYTICAL DASHBOARD CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4">

        {/* Card 1: Score Breakdown */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs text-left">
          <h3 className="font-sans font-bold text-zinc-900 text-sm mb-4">
            Activity & Score Breakdown
          </h3>

          <div className="space-y-3.5 text-xs">
            {/* Transaction Activity Score */}
            <div>
              <div className="flex justify-between font-medium text-zinc-700 mb-1">
                <span>Robinhood Activity</span>
                <span className="font-mono-code font-bold">{totalScore} / 100</span>
              </div>
              {progressBar(totalScore, 100)}
            </div>

            {/* NFT Bonus */}
            <div>
              <div className="flex justify-between font-medium text-zinc-700 mb-1">
                <span>NFT Bonus</span>
                <span className="font-mono-code font-bold">+{formatNumber(data.nftBonus)}</span>
              </div>
              {progressBar(data.nftBonus, Math.max(1, finalAllocation))}
            </div>

            {/* Final Allocation */}
            <div>
              <div className="flex justify-between font-medium text-zinc-900 mb-1">
                <span className="font-bold">Final Allocation</span>
                <span className="font-mono-code font-bold">{formatNumber(finalAllocation)} $WAZI</span>
              </div>
              {progressBar(100, 100)}
            </div>

            <div className="pt-2 border-t border-zinc-100 text-[11px] text-zinc-500 font-mono-code">
              1+ transaction grants eligibility. Each Wazi NFT adds +9,000 $WAZI to your allocation.
            </div>
          </div>
        </div>

        {/* Card 2: Allocation Distribution */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs text-left">
          <h3 className="font-sans font-bold text-zinc-900 text-sm mb-4">
            Allocation Breakdown
          </h3>

          <div className="flex items-center justify-between gap-3">
            {/* SVG Donut Chart */}
            <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                {/* Activity allocation segment */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="none"
                  stroke="#00c805"
                  strokeWidth="14"
                  strokeDasharray={`${(baseShare / 100) * 238.8} 238.8`}
                  strokeDashoffset="0"
                />
                {/* NFT bonus segment */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="none"
                  stroke="#86efac"
                  strokeWidth="14"
                  strokeDasharray={`${(bonusShare / 100) * 238.8} 238.8`}
                  strokeDashoffset={`-${(baseShare / 100) * 238.8}`}
                />
              </svg>

              {/* Inner Center Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-display font-black text-sm text-zinc-950">
                  {formatNumber(finalAllocation)}
                </span>
                <span className="text-[10px] font-mono-code font-bold text-[#00c805]">
                  $WAZI
                </span>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-2 text-[11px] font-mono-code text-zinc-700">
              <div className="flex items-center justify-between space-x-2">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#00c805]" />
                  <span>Activity</span>
                </span>
                <span className="font-bold">{formatNumber(activityAllocation)}</span>
              </div>

              <div className="flex items-center justify-between space-x-2">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#86efac]" />
                  <span>NFT Bonus</span>
                </span>
                <span className="font-bold">+{formatNumber(data.nftBonus)}</span>
              </div>

              <div className="flex items-center justify-between space-x-2 pt-1 border-t border-zinc-100">
                <span className="font-bold text-zinc-900">Final</span>
                <span className="font-bold text-zinc-900">{formatNumber(finalAllocation)} $WAZI</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Network Activity */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs text-left">
          <h3 className="font-sans font-bold text-zinc-900 text-sm mb-4">
            Network Activity
          </h3>

          <div className="space-y-2.5 text-xs font-medium text-zinc-700">
            {/* Real Transactions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-600">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
                <span>Robinhood Transactions</span>
              </div>
              <span className="font-mono-code font-bold text-zinc-900">{formatNumber(data.transactionCount)}</span>
            </div>

            {/* Activity Score */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-600">
                  <Activity className="w-3.5 h-3.5" />
                </div>
                <span>Activity Score</span>
              </div>
              <span className="font-mono-code font-bold text-zinc-900">{totalScore} / 100</span>
            </div>

            {/* Network */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-600">
                  <Network className="w-3.5 h-3.5" />
                </div>
                <span>Network</span>
              </div>
              <span className="font-mono-code font-bold text-zinc-900">Robinhood Chain</span>
            </div>

            {/* Pool */}
            {metrics && (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-600">
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                  <span>Allocation Pool</span>
                </div>
                <span className="font-mono-code font-bold text-zinc-900">
                  {formatNumber(metrics.allocationPool)} $WAZI
                </span>
              </div>
            )}

            {/* Already Allocated */}
            {metrics && (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-600">
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                  <span>Already Allocated</span>
                </div>
                <span className="font-mono-code font-bold text-zinc-900">
                  {formatNumber(metrics.amountAllocated)}
                </span>
              </div>
            )}

            {/* Data Source */}
            <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-full border border-zinc-200 flex items-center justify-center text-zinc-600">
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold text-zinc-900">Data Source</span>
              </div>
              <span className="font-mono-code font-bold text-zinc-900">On-chain</span>
            </div>
          </div>
        </div>

      </div>

      {/* SECTION 4: LOWER ROW (YOUR WAZI NFT(S) & WHAT'S NEXT?) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">

        {/* Card 1: Your Wazi NFT(s) */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs text-left">
          <h3 className="font-sans font-bold text-zinc-900 text-sm mb-4">
            Your Wazi NFT(s)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Holder Status Card */}
            <div className="sm:col-span-8 p-3 rounded-xl bg-zinc-50 border border-zinc-200">
              <div className="flex items-center space-x-2 mb-2">
                <span className="font-bold text-zinc-900 font-mono-code text-sm">Holder Status</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    data.nftHolder
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-zinc-100 border border-zinc-200 text-zinc-500'
                  }`}
                >
                  {data.nftHolder ? 'Holder' : 'Not a Holder'}
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 font-mono-code">
                Wazi NFTs Held: <span className="text-[#00c805] font-bold">{data.nftCount}</span>
              </div>
              <div className="text-[11px] text-zinc-500 font-mono-code mt-1">
                NFT Allocation Bonus: <span className="text-zinc-900 font-semibold">+{formatNumber(data.nftBonus)} $WAZI</span>
              </div>
              <div className="text-[10px] text-zinc-400 font-mono-code mt-1">
                Each Wazi NFT adds +9,000 $WAZI on top of your activity allocation.
              </div>
            </div>

            {/* Bonus Summary */}
            <div className="sm:col-span-4 p-3 rounded-xl border border-dashed border-zinc-300 bg-white flex flex-col items-center justify-center text-center">
              <div className="text-2xl font-black font-display text-zinc-950">
                +{formatNumber(data.nftBonus)}
              </div>
              <span className="text-[11px] font-mono-code text-zinc-500 font-semibold mt-1">
                NFT Bonus
              </span>
              <span className="text-[10px] text-zinc-400 font-mono-code">
                on top of activity
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: What's Next? */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs text-left relative overflow-hidden flex items-center justify-between">
          <div className="space-y-3">
            <h3 className="font-sans font-bold text-zinc-900 text-sm mb-2">
              What&apos;s Next?
            </h3>

            <div className="space-y-2.5 text-xs font-mono-code">
              {/* Step 1: Checked */}
              <div className="flex items-center space-x-2 text-zinc-900 font-bold">
                <span className="w-5 h-5 rounded-full bg-[#00c805] text-white flex items-center justify-center text-[10px]">
                  ✓
                </span>
                <span>Eligibility checked</span>
              </div>

              {/* Step 2: Snapshot */}
              <div className="flex items-center space-x-2 text-zinc-900 font-bold">
                <span className="w-5 h-5 rounded-full bg-[#00c805] text-white flex items-center justify-center text-[10px]">
                  ✓
                </span>
                <span>Allocation snapshot finalized</span>
              </div>

              {/* Step 3: Distribution */}
              <div className="flex items-center space-x-2 text-zinc-500">
                <span className="w-5 h-5 rounded-full border border-zinc-300 text-zinc-400 flex items-center justify-center text-[10px]">
                  ◷
                </span>
                <span>Distribution</span>
              </div>

              {/* Step 4: Discord / X */}
              <div className="flex items-center space-x-2 text-zinc-500">
                <span className="w-5 h-5 rounded-full border border-zinc-300 text-zinc-400 flex items-center justify-center text-[10px]">
                  ◷
                </span>
                <span>Stay tuned on X / Discord</span>
              </div>
            </div>
          </div>

          {/* Right Wojak with Headphones + GOOD MUSIC BETTER DAYS */}
          <div className="hidden sm:flex flex-col items-center justify-center w-28 shrink-0 relative">
            <span className="absolute -top-3 right-0 font-handwriting text-[11px] font-bold text-zinc-800 leading-tight transform rotate-6 text-right">
              GOOD<br />
              MUSIC<br />
              BETTER<br />
              DAYS.
            </span>
            <span className="absolute top-4 left-0 text-xs font-mono-code text-zinc-700">
              ♫
            </span>
            <img
              src="/images/wazi_headphones_1789325468440.jpg"
              alt="Headphone Wojak"
              referrerPolicy="no-referrer"
              className="w-24 h-auto object-contain mix-blend-multiply mt-4"
            />
          </div>
        </div>

      </div>

      {/* SECTION 5: LOWER COMMUNITY / QUOTE ROW */}
      <div className="pt-8 border-t border-zinc-100 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
        {/* Left: Desk Wojak */}
        <div className="flex items-center space-x-3">
          <div className="w-24 h-24 shrink-0">
            <img
              src="/images/wazi_desk_1789325482918.jpg"
              alt="Wojak at desk"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain mix-blend-multiply"
            />
          </div>
          <div className="font-handwriting text-xs font-bold text-zinc-800 transform -rotate-3 leading-tight text-left">
            SAME<br />
            FEELINGS.<br />
            NEW<br />
            OPPORTUNITIES.
          </div>
        </div>

        {/* Center: Manifesto */}
        <div className="text-center px-4">
          <div className="font-sans font-bold text-base sm:text-lg text-zinc-950 tracking-tight">
            &ldquo; MORE THAN JUST A MEME.<br />
            A BRIGHTER TOMORROW. &rdquo;
          </div>
          {/* Green underline stroke */}
          <div className="w-36 h-1 bg-[#00c805] rounded-full mx-auto my-2" />
          <div className="text-[10px] font-mono-code text-zinc-400 uppercase tracking-[0.2em]">
            WAZIHOOD · ROBINHOOD CHAIN · $WAZI
          </div>
        </div>

        {/* Right: Sunrise Wojak */}
        <div className="flex items-center space-x-3">
          <div className="w-24 h-24 shrink-0">
            <img
              src="/images/wazi_sunrise_wojak_1789331809265.jpg"
              alt="Wojak looking at sunrise"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain mix-blend-multiply"
            />
          </div>
          <div className="font-handwriting text-xs font-bold text-zinc-800 transform rotate-3 leading-tight text-left">
            A<br />
            BRIGHTER<br />
            TOMORROW.
          </div>
        </div>
      </div>

    </div>
  );
};