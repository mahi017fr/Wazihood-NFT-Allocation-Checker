import 'dotenv/config';

const OFFICIAL_ALCHEMY_URL_TEMPLATE = 'https://robinhood-mainnet.g.alchemy.com/v2/{API_KEY}';

function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return fallback;
}

export interface ScoreTier {
  threshold: number;
  score: number;
}

const DEFAULT_ACTIVITY_SCORE_TIERS: ScoreTier[] = [
  { threshold: 1, score: 10 },
  { threshold: 5, score: 25 },
  { threshold: 10, score: 40 },
  { threshold: 25, score: 55 },
  { threshold: 50, score: 70 },
  { threshold: 100, score: 80 },
  { threshold: 250, score: 92 },
  { threshold: 500, score: 100 },
];

/**
 * Parses the configurable activity-score curve: a JSON object mapping
 * transaction-count thresholds to normalized activity scores (max 100).
 * Lower thresholds are automatically raised to the minimum score so a single
 * transaction always yields a positive, monotonic score.
 */
function readScoreTiers(raw: string | undefined): ScoreTier[] {
  if (raw && raw.trim()) {
    try {
      const parsed: Record<string, unknown> = JSON.parse(raw);
      const tiers: ScoreTier[] = [];
      for (const [threshold, score] of Object.entries(parsed)) {
        const thresholdNum = Number(threshold);
        const scoreNum = Number(score);
        if (Number.isFinite(thresholdNum) && thresholdNum > 0 && Number.isFinite(scoreNum)) {
          tiers.push({ threshold: thresholdNum, score: Math.max(0, Math.min(100, scoreNum)) });
        }
      }
      tiers.sort((a, b) => a.threshold - b.threshold);
      if (tiers.length > 0) return tiers;
    } catch {
      // fall through to defaults
    }
  }
  return DEFAULT_ACTIVITY_SCORE_TIERS;
}

const alchemyUrl = (process.env.ALCHEMY_URL || '').trim();
const alchemyApiKey = (process.env.ALCHEMY_API_KEY || '').trim();
const resolvedAlchemyUrl =
  alchemyUrl || (alchemyApiKey ? OFFICIAL_ALCHEMY_URL_TEMPLATE.replace('{API_KEY}', alchemyApiKey) : '');

const rpcUrl = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';

export const config = {
  port: toNumber(process.env.PORT, 3001),

  network: {
    name: 'Robinhood Chain',
    chainId: toNumber(process.env.ROBINHOOD_CHAIN_ID, 4663),
    rpcUrl,
    timeoutMs: toNumber(process.env.ROBINHOOD_RPC_TIMEOUT_MS, 20000),
  },

  waziNft: {
    contractAddress: (process.env.WAZI_NFT_CONTRACT_ADDRESS || '').trim().toLowerCase(),
    standard: (process.env.WAZI_NFT_STANDARD || 'ERC721').trim().toUpperCase(),
    tokenId: (process.env.WAZI_NFT_TOKEN_ID || '').trim(),
  },

  opensea: {
    collectionUrl: (process.env.WAZI_OPENSEA_COLLECTION_URL || '').trim(),
  },

  alchemy: {
    url: resolvedAlchemyUrl,
    apiKey: alchemyApiKey,
  },

  // All on-chain reads go through this provider. Prefers Alchemy (indexed)
  // when configured; otherwise falls back to the official Robinhood Chain RPC.
  dataProvider: {
    url: resolvedAlchemyUrl || rpcUrl,
    timeoutMs: toNumber(process.env.ROBINHOOD_RPC_TIMEOUT_MS, 20000),
  },

  allocation: {
    minAllocation: toNumber(process.env.MIN_ELIGIBLE_ALLOCATION, 1),
    maxAllocation: toNumber(process.env.MAX_ELIGIBLE_ALLOCATION, 100_000),
    maxActivityAllocation: toNumber(process.env.MAX_ACTIVITY_ALLOCATION, 30_000),
    activityScoreTiers: readScoreTiers(process.env.ACTIVITY_SCORE_TIERS_JSON),
    nftHolderBonusPercent: toNumber(process.env.NFT_HOLDER_BONUS_PERCENT, 20),
    nftHolderBonusAllocation: toNumber(process.env.NFT_HOLDER_BONUS_ALLOCATION, 0),
    season: (process.env.SEASON01_NAME || 'Season 01').trim(),
  },

  tokenomics: {
    totalSupply: toNumber(process.env.SEASON01_TOTAL_SUPPLY, 100_000_000_000),
    season1Pool: toNumber(process.env.SEASON01_TOTAL_POOL, 30_000_000_000),
    alreadyAllocated: toNumber(process.env.SEASON01_ALREADY_ALLOCATED, 0),
  },

  persistence: {
    store: (process.env.ALLOCATION_STORE || 'sqlite').trim().toLowerCase(),
    databasePath: (process.env.ALLOCATION_DB_PATH || './data/allocations.sqlite').trim(),
    databaseUrl: (process.env.DATABASE_URL || '').trim(),
  },
};

export const isNftContractConfigured = () => config.waziNft.contractAddress.length > 0;
export const isAlchemyConfigured = () => config.alchemy.url.length > 0;
export const isDataProviderConfigured = () => config.dataProvider.url.length > 0;