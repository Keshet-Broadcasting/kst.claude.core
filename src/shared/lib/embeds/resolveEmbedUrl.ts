import type { EmbedUrls } from './types';

/** Picks the right per-environment URL out of an embed.json's `urls` map, defaulting to production. */
export function resolveEmbedUrl(urls: EmbedUrls, env = 'production'): string {
  return urls[env as keyof EmbedUrls] ?? urls.production;
}
