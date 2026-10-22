export class AppError extends Error {
  constructor(message, status = 500, expose = true) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.expose = expose;
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AppError('源站响应超时，请稍后重试', 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWithRetry(url, options = {}, { timeoutMs = 15000, retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      if ((response.status >= 500 || response.status === 429) && attempt < retries) {
        await response.body?.cancel().catch(() => {});
        lastError = new AppError(`源站暂时不可用（${response.status}）`, 502);
        await sleep(500 * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}
