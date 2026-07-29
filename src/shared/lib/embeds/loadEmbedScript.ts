export type LoadEmbedScriptOptions = {
  /** URL of the script that defines the custom element. */
  src: string;
  /** The custom element's tag name, e.g. "demo-embed". */
  tagName: string;
};

const pendingBySrc = new Map<string, Promise<void>>();

/**
 * Loads a third-party custom-element script exactly once per `src`, then resolves once the
 * element is actually defined. Safe to call from multiple components/mounts concurrently
 * (React Strict Mode's double-invoke in dev included) — the in-flight promise is cached by
 * `src`, so a second call while the first is still loading returns the same promise instead
 * of injecting a second <script> tag.
 */
export function loadEmbedScript({ src, tagName }: LoadEmbedScriptOptions): Promise<void> {
  const cached = pendingBySrc.get(src);
  if (cached) {
    return cached;
  }

  const promise = new Promise<void>((resolve, reject) => {
    if (customElements.get(tagName)) {
      resolve();
      return;
    }

    const existingScript = document.head.querySelector<HTMLScriptElement>(
      `script[data-embed-src="${src}"]`,
    );

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.embedSrc = src;
      script.addEventListener('error', () => {
        pendingBySrc.delete(src);
        reject(new Error(`Failed to load embed script: ${src}`));
      });
      document.head.appendChild(script);
    }

    void customElements.whenDefined(tagName).then(() => resolve());
  });

  pendingBySrc.set(src, promise);
  return promise;
}

/** Test-only escape hatch — the dedupe cache is intentionally module-scoped, not exported. */
if (typeof globalThis !== 'undefined') {
  (
    globalThis as { __resetLoadEmbedScriptCacheForTests?: () => void }
  ).__resetLoadEmbedScriptCacheForTests = () => pendingBySrc.clear();
}
