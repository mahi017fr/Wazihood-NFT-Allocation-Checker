import { config, isNftContractConfigured, isDataProviderConfigured } from './config';
import { buildApp } from './app';

const app = buildApp();

app.listen(config.port, () => {
  console.log(`[wazihood-server] listening on http://localhost:${config.port}`);
  console.log(`[wazihood-server] network=${config.network.name} chainId=${config.network.chainId}`);
  console.log(
    `[wazihood-server] WAZI_NFT_CONTRACT_ADDRESS=${isNftContractConfigured() ? config.waziNft.contractAddress : '(not configured)'}`,
  );
  console.log(
    `[wazihood-server] data provider=${isDataProviderConfigured() ? 'configured' : '(not configured)'}`,
  );
});