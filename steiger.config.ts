import { defineConfig } from 'steiger';
import fsd from '@feature-sliced/steiger-plugin';

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // Test files legitimately wire the composition root (e.g. wrapping a feature's component
    // in <AppStoreProvider> from '@/app' to render it) to exercise the real integration — that
    // is not a production import-boundary violation, just how FSD slices get tested in
    // isolation from Next's own routing. Production code must still obey layer direction.
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      'fsd/forbidden-imports': 'off',
    },
  },
  {
    // This starter's demo intentionally shows exactly one feature end-to-end
    // (entity → feature → widget → page → route) — every slice in that chain has exactly
    // one reference by design, not by accident. Disabled here rather than per-slice so a
    // real app built alongside the demo still gets the warning once it has more than one.
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
]);
