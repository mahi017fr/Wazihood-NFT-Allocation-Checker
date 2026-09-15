import express from 'express';
import fs from 'fs';
import path from 'path';
import { config, isNftContractConfigured, isDataProviderConfigured } from './config.js';
import { toApiErrorBody, toApiSuccessBody, ApiError } from './errors.js';
import { getAllocationCheckService } from './services/allocationCheckService.js';
import { getAllocationRepository } from './persistence/index.js';
import type { AllocationRepository } from './persistence/allocationRepository.js';

export interface AppOptions {
  allocationCheckService?: { check(walletAddress: string): Promise<unknown> };
  allocationRepository?: AllocationRepository;
}

/**
 * Require the configured ADMIN_API_KEY before granting access to admin
 * endpoints. The key is a server-side secret that must never ship in frontend
 * code. When ADMIN_API_KEY is empty the admin APIs are disabled entirely.
 */
function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const adminKey = config.admin.apiKey;
  if (!adminKey) {
    return next(
      new ApiError(
        503,
        'ADMIN_API_NOT_CONFIGURED',
        'Admin API key is not configured.',
        'Set ADMIN_API_KEY in the server environment to enable admin endpoints.',
      ),
    );
  }
  const header = (req.header('x-admin-api-key') || '').trim();
  const authorization = (req.header('authorization') || '').trim();
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
  const provided = header || bearer;
  if (!provided || provided !== adminKey) {
    return next(new ApiError(401, 'UNAUTHORIZED', 'Missing or invalid admin API key.'));
  }
  return next();
}

/**
 * Builds the Express application. The allocation check service can be injected
 * for integration tests; otherwise the configured shared service is used.
 */
export function buildApp(options: AppOptions = {}): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  });

  const allocationCheckService = options.allocationCheckService ?? getAllocationCheckService();
  const resolveAllocationRepository = (): AllocationRepository =>
    options.allocationRepository ?? getAllocationRepository();

  app.get('/api/health', (req, res) => {
    res.json(
      toApiSuccessBody({
        status: 'ok',
        network: config.network.name,
        chainId: config.network.chainId,
        nftContractConfigured: isNftContractConfigured(),
        dataProviderConfigured: isDataProviderConfigured(),
        nftStandard: config.waziNft.standard,
      }),
    );
  });

  app.get('/api/config', (req, res) => {
    res.json(
      toApiSuccessBody({
        openseaCollectionUrl: config.opensea.collectionUrl,
        nftContractConfigured: isNftContractConfigured(),
      }),
    );
  });

  // Pool metrics. Values that cannot be obtained reliably
  // from the configured indexer/provider are returned as null - never faked.
  app.get('/api/metrics', async (req, res) => {
    const network = config.network.name;
    const pool = config.tokenomics.allocationPool;
    const amountAllocated =
      (await resolveAllocationRepository().totalAllocated(network)) + config.tokenomics.alreadyAllocated;
    res.json(
      toApiSuccessBody({
        network,
        allocationPool: pool,
        amountAllocated,
        remainingPool: Math.max(0, pool - amountAllocated),
        totalWaziNftHolders: null,
        totalWaziNftSupply: null,
        totalIndexedTransactions: null,
      }),
    );
  });

  app.post('/api/allocation/check', async (req, res) => {
    try {
      const body = req.body as { walletAddress?: unknown } | null | undefined;
      const walletAddress = body && typeof body === 'object' ? String((body as { walletAddress?: unknown }).walletAddress ?? '') : '';
      const data = await allocationCheckService.check(walletAddress);
      res.json(toApiSuccessBody(data));
    } catch (error) {
      if (error instanceof ApiError) {
        console.error(
          `[AllocationCheck] check failed code=${error.code} status=${error.status} wallet=${typeof req.body === 'object' && req.body ? String((req.body as { walletAddress?: string }).walletAddress ?? '') : ''}`,
        );
      }
      const { status, body: errorBody } = toApiErrorBody(error);
      res.status(status).json(errorBody);
    }
  });

  // ── Admin (authenticated) ───────────────────────────────────────────────
  function adminRecordView(record: {
    walletAddress: string;
    network: string;
    allocation: number;
    transactionCountAtSnapshot: number;
    activityScore: number;
    baseAllocation: number;
    nftBonus: number;
    nftHolderAtSnapshot: boolean;
    nftCountAtSnapshot: number;
    nftBonusApplied: boolean;
    nftUpgradeAt: string | null;
    createdAt: string;
    updatedAt: string;
  }) {
    return {
      walletAddress: record.walletAddress,
      network: record.network,
      allocation: record.allocation,
      transactionCount: record.transactionCountAtSnapshot,
      activityScore: record.activityScore,
      baseAllocation: record.baseAllocation,
      nftBonus: record.nftBonus,
      nftHolder: record.nftHolderAtSnapshot,
      nftCount: record.nftCountAtSnapshot,
      nftBonusApplied: record.nftBonusApplied,
      allocationSource: record.nftUpgradeAt ? 'nft_upgrade' : 'snapshot',
      allocationUpgraded: record.nftUpgradeAt !== null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      nftUpgradeAt: record.nftUpgradeAt,
    };
  }

  app.get('/api/admin/allocations', requireAdminAuth, async (req, res) => {
    try {
      const network = config.network.name;
      const parsePositiveInt = (raw: unknown, fallback: number): number => {
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
      };
      const limit = parsePositiveInt(req.query.limit, 50) || 50;
      const offset = parsePositiveInt(req.query.offset, 0) || 0;
      const result = await resolveAllocationRepository().listAllocations(network, {
        limit: Math.min(200, limit),
        offset,
      });
      res.json(
        toApiSuccessBody({
          records: result.records.map(adminRecordView),
          pagination: {
            total: result.total,
            limit,
            offset,
          },
        }),
      );
    } catch (error) {
      const { status, body: errorBody } = toApiErrorBody(error);
      res.status(status).json(errorBody);
    }
  });

  app.get('/api/admin/metrics', requireAdminAuth, async (req, res) => {
    try {
      const network = config.network.name;
      const pool = config.tokenomics.allocationPool;
      const stats = await resolveAllocationRepository().allocationStats(network);
      const amountAllocated = stats.totalAllocated + config.tokenomics.alreadyAllocated;
      res.json(
        toApiSuccessBody({
          network,
          totalWalletsChecked: stats.totalWallets,
          totalEligibleWallets: stats.eligibleWallets,
          totalAllocated: amountAllocated,
          remainingPool: Math.max(0, pool - amountAllocated),
          totalNftBonusAllocated: stats.totalNftBonus,
          nftUpgradedWallets: stats.nftUpgradedWallets,
        }),
      );
    } catch (error) {
      const { status, body: errorBody } = toApiErrorBody(error);
      res.status(status).json(errorBody);
    }
  });

  // Express 4 does not forward async handler rejections on its own; this
  // guarantees any uncaught error still returns the structured JSON envelope.
  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(error);
    if (error instanceof ApiError) {
      console.error(`[AllocationCheck] uncaught ApiError code=${error.code} status=${error.status}`);
    } else {
      const message = error instanceof Error ? error.message : 'Unknown internal error';
      console.error(`[AllocationCheck] uncaught error=${message}`);
    }
    const { status, body: errorBody } = toApiErrorBody(error);
    res.status(status).json(errorBody);
  });

  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/).*/, (req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}