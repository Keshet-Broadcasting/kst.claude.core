export type EmbedUrls = {
  development: string;
  staging: string;
  production: string;
};

export type EmbedManifest = {
  tagName: string;
  urls: EmbedUrls;
  allowedProps: string[];
  forbiddenProps: string[];
  templateVersion: string;
};

/** Bump this when the `embed:add` template's generated output shape changes; `embed:check`
 * flags any embed.json whose templateVersion doesn't match. */
export const CURRENT_EMBED_TEMPLATE_VERSION = '1.0.0';
