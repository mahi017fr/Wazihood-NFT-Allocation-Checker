import { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { LoadingScanner } from './components/LoadingScanner';
import { ResultsDashboard } from './components/ResultsDashboard';
import { NotEligibleResult } from './components/NotEligibleResult';
import { VerificationError } from './components/VerificationError';
import { WojakLineupBanner } from './components/WojakLineupBanner';
import { CommunitySection } from './components/CommunitySection';
import { Footer } from './components/Footer';
import { AllocationCheckResponse, ScannerStage } from './types';
import {
  AllocationApiError,
  checkWalletAllocation,
  fetchAppConfig,
  isValidWalletAddress,
} from './services/allocationApiService';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  const [walletInput, setWalletInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scannerStage, setScannerStage] = useState<ScannerStage>('idle');
  const [allocationData, setAllocationData] = useState<AllocationCheckResponse | null>(null);
  const [error, setError] = useState<AllocationApiError | null>(null);
  const [openseaUrl, setOpenseaUrl] = useState('');
  const [lastCheckedAddress, setLastCheckedAddress] = useState('');

  useEffect(() => {
    fetchAppConfig()
      .then((cfg) => setOpenseaUrl(cfg.openseaCollectionUrl))
      .catch(() => setOpenseaUrl(''));
  }, []);

  const handleStartCheck = async (targetAddress: string) => {
    const trimmed = targetAddress.trim();
    if (!trimmed || isScanning) return;

    setAllocationData(null);
    setError(null);
    setIsScanning(true);
    setScannerStage('scanning_wallet');
    setLastCheckedAddress(trimmed);

    if (!isValidWalletAddress(trimmed)) {
      setScannerStage('idle');
      setIsScanning(false);
      setError(new AllocationApiError('INVALID_ADDRESS', 'Invalid wallet address.'));
      return;
    }

    try {
      const resultPromise = checkWalletAllocation(trimmed);

      // Keep the approved scanning animation, running concurrently with the real API request.
      await sleep(600);
      setScannerStage('checking_nft');
      await sleep(650);
      setScannerStage('analyzing_activity');
      await sleep(600);
      setScannerStage('calculating_allocation');
      await sleep(540);

      const result = await resultPromise;
      setScannerStage('complete');
      setAllocationData(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setScannerStage('idle');
      setAllocationData(null);
      setError(err instanceof AllocationApiError ? err : new AllocationApiError('INTERNAL_ERROR', 'Verification failed.'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsScanning(false);
    }
  };

  const handleRetry = () => {
    if (lastCheckedAddress) {
      void handleStartCheck(lastCheckedAddress);
    }
  };

  const handleReset = () => {
    setAllocationData(null);
    setScannerStage('idle');
    setWalletInput('');
    setError(null);
    setLastCheckedAddress('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isEligibleResult = !isScanning && allocationData && allocationData.eligible;
  const isNotEligibleResult = !isScanning && allocationData && !allocationData.eligible;
  const showError = !isScanning && !allocationData && error;
  const showLanding = !isScanning && !allocationData && !error;

  return (
    <div className="min-h-screen flex flex-col justify-between bg-white text-zinc-900 selection:bg-[#00c805] selection:text-white relative overflow-x-hidden">
      {/* Background Subtle Cyber Grid */}
      <div className="fixed inset-0 bg-cyber-grid opacity-40 pointer-events-none -z-10" />

      {/* TOP: Wazihood branding with green underline, 3 middle menu items & LIVE badge */}
      <Navbar onHomeClick={handleReset} />

      {/* CENTER: Main Application Flow */}
      <main className="flex-1 flex flex-col justify-start items-center w-full">
        {/* State A: Scanning Loading State */}
        {isScanning && (
          <div className="w-full max-w-xl mx-auto py-12 px-4">
            <LoadingScanner
              currentStage={scannerStage}
              walletAddress={walletInput || lastCheckedAddress}
            />
          </div>
        )}

        {/* State B: Eligible Result Found */}
        {isEligibleResult && allocationData && (
          <div className="w-full py-6 px-4">
            <ResultsDashboard
              data={allocationData}
              onReset={handleReset}
            />
          </div>
        )}

        {/* State C: Not Eligible Result (valid, successful check) */}
        {isNotEligibleResult && allocationData && (
          <div className="w-full py-6 px-4">
            <NotEligibleResult
              data={allocationData}
              openseaCollectionUrl={openseaUrl}
              onReset={handleReset}
            />
          </div>
        )}

        {/* State D: Verification / System / Config / Invalid Address Error */}
        {showError && error && (
          <div className="w-full py-6 px-4">
            <VerificationError
              error={error}
              onRetry={handleRetry}
              onDismiss={handleReset}
            />
          </div>
        )}

        {/* State E: Main Landing Hero & Wallet Checker */}
        {showLanding && (
          <div className="w-full">
            <Hero
              walletInput={walletInput}
              setWalletInput={setWalletInput}
              onSubmit={handleStartCheck}
              isScanning={isScanning}
            />

            {/* Wojak Lineup Banner (The 7 Characters & Timeline) */}
            <WojakLineupBanner />

            {/* Built by the Community Section (Polaroids + Manifesto + Balcony Night scene) */}
            <CommunitySection />
          </div>
        )}
      </main>

      {/* BOTTOM: Footer with social icons */}
      <Footer doodleText={allocationData ? 'STILL\nHOLDING.' : 'A BRIGHTER\nTOMORROW.'} />
    </div>
  );
}