import React from 'react';
import { RefreshCw, AlertTriangle, Settings, Ban } from 'lucide-react';
import { AllocationApiError } from '../services/allocationApiService';

type ErrorKind = 'system' | 'config' | 'invalid';

interface VerificationErrorProps {
  error: AllocationApiError;
  onRetry?: () => void;
  onDismiss?: () => void;
}

interface ErrorCopy {
  kind: ErrorKind;
  title: string;
  message: string;
  hint?: string;
}

function describeError(error: AllocationApiError): ErrorCopy {
  switch (error.code) {
    case 'INVALID_ADDRESS':
      return {
        kind: 'invalid',
        title: 'INVALID WALLET ADDRESS',
        message: 'Please enter a valid Robinhood Chain wallet address.',
      };
    case 'NFT_CONTRACT_NOT_CONFIGURED':
      return {
        kind: 'config',
        title: 'VERIFICATION TEMPORARILY UNAVAILABLE',
        message: 'The Wazi NFT contract has not been configured yet.',
      };
    case 'NFT_CONTRACT_NOT_DEPLOYED':
      return {
        kind: 'config',
        title: 'VERIFICATION TEMPORARILY UNAVAILABLE',
        message: 'The configured Wazi NFT contract was not found on Robinhood Chain.',
        hint: 'Please verify that the NFT contract address is deployed on Robinhood Chain Mainnet.',
      };
    default:
      return {
        kind: 'system',
        title: 'VERIFICATION FAILED',
        message: error.message || "We couldn't verify this wallet right now.",
      };
  }
}

export const VerificationError: React.FC<VerificationErrorProps> = ({ error, onRetry, onDismiss }) => {
  const { kind, title, message, hint } = describeError(error);

  const Icon = kind === 'invalid' ? Ban : kind === 'config' ? Settings : AlertTriangle;

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-8">
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-7 text-center relative overflow-hidden">
        {/* Subtle amber glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-56 h-24 bg-amber-100/60 blur-[60px] pointer-events-none" />

        <div className="relative">
          <div className="mx-auto w-12 h-12 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center mb-4">
            <Icon className="w-5 h-5 text-zinc-600" />
          </div>

          <div className="text-xs font-mono-code font-bold uppercase tracking-widest text-zinc-400 mb-2">
            {title}
          </div>

          <div className="font-display font-bold text-lg text-zinc-950 mb-3">
            {message}
          </div>

          {kind === 'system' && (
            <p className="text-xs font-mono-code text-zinc-500 mb-5">
              {error.details || 'We could not reliably determine the status of this wallet right now.'}
            </p>
          )}
          {kind === 'config' && (
            <div className="mb-5 space-y-1">
              {hint && <p className="text-xs font-mono-code text-zinc-500">{hint}</p>}
              <p className="text-xs font-mono-code text-zinc-500">
                This is a system configuration issue, not a user eligibility issue.
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            {kind === 'system' && onRetry ? (
              <button
                onClick={onRetry}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-[#00c805] hover:bg-[#00b004] text-zinc-950 text-xs font-mono-code font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>TRY AGAIN</span>
              </button>
            ) : onDismiss ? (
              <button
                onClick={onDismiss}
                className="inline-flex items-center px-5 py-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-xs font-mono-code font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                OK
              </button>
            ) : null}
          </div>

          <div className="mt-4 text-[10px] font-mono-code text-zinc-400 uppercase tracking-wider">
            Error code: {error.code}
          </div>
        </div>
      </div>
    </div>
  );
};