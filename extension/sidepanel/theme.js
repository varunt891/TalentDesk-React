// Appearance only; sourcing, authentication and capture behavior are unchanged.
(() => {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'dark';
  let edited = false;
  const apply = () => {
    document.documentElement.dataset.theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    const select = document.getElementById('appearanceTheme');
    if (select) select.value = preference;
  };
  const valid = value => ['dark', 'light', 'system'].includes(value);
  globalThis.chrome?.storage?.local?.get(['extensionTheme']).then(saved => {
    if (!edited && valid(saved.extensionTheme)) preference = saved.extensionTheme;
    apply();
  }).catch(() => {});
  media.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('appearanceTheme').addEventListener('change', event => {
      if (!valid(event.target.value)) return;
      edited = true;
      preference = event.target.value;
      apply();
      globalThis.chrome?.storage?.local?.set({ extensionTheme: preference }).catch(() => {});
    });
  });
})();
