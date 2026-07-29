// FAKE, LOCAL EXAMPLE — served from public/, no real third-party script. Delete this file
// (and src/shared/embeds/demo-embed/) when starting a real project; it exists only to prove
// pnpm embed:check, the ESLint embed-boundary rules, and steiger's ignore of root app/ all
// have something real to validate.
(function () {
  class DemoEmbed extends HTMLElement {
    connectedCallback() {
      this.textContent = 'demo-embed placeholder (fake, local, offline)';
      this.style.display = 'inline-block';
      this.style.padding = '4px 8px';
      this.style.border = '1px dashed currentColor';
    }
  }

  if (!customElements.get('demo-embed')) {
    customElements.define('demo-embed', DemoEmbed);
  }
})();
