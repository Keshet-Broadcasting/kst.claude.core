import { useEffect, useState } from 'react';

/**
 * Loads the self-contained `<kst-auth-widget>` bundle (Angular Elements) exactly once,
 * regardless of how many <KstAuthWidget> instances mount or how often they re-render.
 *
 * Registration of a custom element is a global, one-time side effect, so we cache the
 * load promise at module scope and resolve only once the element is actually defined
 * (`customElements.whenDefined`).
 */

export type WidgetScriptStatus = 'loading' | 'ready' | 'error';

const ELEMENT_NAME = 'kst-auth-widget';

/**
 * The one hosted bundle. There is no dev/stage/prod variant: kst.auth.api is a single
 * deployment and derives the environment from the `azure-app-id` the widget is given,
 * so this URL is the same for every host and every environment.
 */
export const WIDGET_SCRIPT_SRC = 'https://app.keshet-tv.com/widgets/kst.auth.widget.js';

// One in-flight/settled promise, shared across all hook instances.
let loader: Promise<void> | null = null;

function isElementDefined(): boolean {
  return typeof window !== 'undefined' && !!window.customElements?.get(ELEMENT_NAME);
}

function loadScript(): Promise<void> {
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      // SSR / non-browser: nothing to load here.
      reject(new Error('kst-auth-widget can only load in a browser environment'));
      return;
    }

    if (isElementDefined()) {
      resolve();
      return;
    }

    const selector = 'script[data-kst-auth-widget]';
    let script = document.querySelector<HTMLScriptElement>(selector);

    if (!script) {
      script = document.createElement('script');
      script.src = WIDGET_SCRIPT_SRC;
      script.async = true;
      script.dataset.kstAuthWidget = 'true';
      document.head.appendChild(script);
    }

    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener(
      'error',
      () => reject(new Error(`Failed to load kst-auth-widget script: ${WIDGET_SCRIPT_SRC}`)),
      { once: true },
    );
  });

  return loader;
}

export function useWidgetScript(): WidgetScriptStatus {
  const [status, setStatus] = useState<WidgetScriptStatus>(() =>
    isElementDefined() ? 'ready' : 'loading',
  );

  useEffect(() => {
    let active = true;

    loadScript()
      .then(() => window.customElements.whenDefined(ELEMENT_NAME))
      .then(() => {
        if (active) setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });

    return () => {
      active = false;
    };
  }, []);

  return status;
}
