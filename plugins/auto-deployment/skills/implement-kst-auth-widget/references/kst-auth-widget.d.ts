import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/**
 * JSX typing for the `<kst-auth-widget>` custom element (React 19+).
 *
 * React 19 resolves intrinsic elements from the `react` module's `JSX` namespace, so we
 * augment that. Declares `azure-app-id`, `theme` and `getToken`. If the user explicitly
 * asks for a selection mode, add `'selection-mode'?: 'single' | 'multi'` here too.
 *
 * Note the naming split: `azure-app-id` and `theme` are dash-case because they travel as
 * attributes, while `getToken` is camelCase because a function can only be set as a
 * property — React 19 does that automatically for non-primitive values.
 *
 * The types are imported by name rather than via a default `React` import: `@types/react`
 * uses `export =`, so a default import needs `esModuleInterop`/`allowSyntheticDefaultImports`,
 * which strict setups (`verbatimModuleSyntax` with interop off) don't have.
 */

interface KstAuthWidgetAttributes
  extends DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> {
  /** Required. The application's Azure AD app (client) id (GUID). */
  'azure-app-id': string;
  /** Optional colour theme. Defaults to 'dark'. */
  theme?: 'light' | 'dark';
  /**
   * Optional. Supplies the kst.auth.api bearer token so the widget does not run its own
   * login. Called on every request. Set as a property, never as an attribute.
   */
  getToken?: () => string | Promise<string>;
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'kst-auth-widget': KstAuthWidgetAttributes;
    }
  }
}
