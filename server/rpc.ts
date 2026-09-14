import { ApiError } from './errors';

export interface JsonRpcResult {
  result: unknown;
}

function redactSecrets(value: string): string {
  return value.replace(/(v2\/)[A-Za-z0-9_-]+/g, '$1***');
}

function logRpcFailure(method: string, label: string, context: unknown): void {
  const contextMessage =
    context && typeof context === 'object' && 'message' in context
      ? String((context as { message: unknown }).message)
      : String(context ?? 'unknown');
  console.error(`[rpc] ${label} failed method=${method} reason=${redactSecrets(contextMessage)}`);
}

export async function jsonRpcCall(
  url: string,
  method: string,
  params: unknown[],
  timeoutMs: number,
  label = 'blockchain RPC',
): Promise<unknown> {
  if (!url) {
    throw new ApiError(
      503,
      'PROVIDER_UNAVAILABLE',
      'Blockchain data provider is not configured.',
      'Set ROBINHOOD_RPC_URL or ALCHEMY_URL.',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      logRpcFailure(method, label, `timeout after ${timeoutMs}ms`);
      throw new ApiError(
        504,
        'RPC_TIMEOUT',
        'Your request timed out while checking Robinhood Chain.',
        'Please try again in a few moments.',
      );
    }
    logRpcFailure(method, label, error);
    throw new ApiError(
      502,
      'RPC_UNAVAILABLE',
      'Robinhood Chain could not be reached.',
      'Please try again in a few moments.',
    );
  } finally {
    if (!controller.signal.aborted) clearTimeout(timer);
  }

  if (response.status === 429) {
    console.warn(`[rpc] ${label} rate limited method=${method}`);
    throw new ApiError(
      429,
      'RATE_LIMITED',
      'Rate limit reached while checking Robinhood Chain.',
      'Please try again in a few moments.',
    );
  }
  if (!response.ok) {
    logRpcFailure(method, label, `http ${response.status}`);
    throw new ApiError(
      502,
      'RPC_UNAVAILABLE',
      'Robinhood Chain could not be reached.',
      `Provider returned HTTP ${response.status}.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    logRpcFailure(method, label, 'invalid json response');
    throw new ApiError(
      502,
      'RPC_UNAVAILABLE',
      'Robinhood Chain returned an invalid response.',
      'Please try again in a few moments.',
    );
  }

  const body = payload as { result?: unknown; error?: { message?: string } };
  if (body.error) {
    logRpcFailure(method, label, body.error.message || 'rpc error');
    throw new ApiError(
      502,
      'RPC_UNAVAILABLE',
      'Robinhood Chain returned an error.',
      'Please try again in a few moments.',
    );
  }
  return body.result;
}