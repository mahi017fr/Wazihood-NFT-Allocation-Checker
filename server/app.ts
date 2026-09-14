import express from 'express';
import fs from 'fs';
import path from 'path';
import { config, isNftContractConfigured, isDataProviderConfigured } from './config.js';
import { toApiErrorBody, toApiSuccessBody, ApiError } from './errors.js';
import { getAllocationCheckService } from './services/allocationCheckService.js';
import { getAllocationRepository } from './persistence/index.js';

export interface AppOptions {
  allocationCheckService?: { check(walletAddress: string): Promise<unknown> };
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
    const repository = getAllocationRepository();
    const pool = config.tokenomics.allocationPool;
    const amountAllocated =
      (await repository.totalAllocated(network)) + config.tokenomics.alreadyAllocated;
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