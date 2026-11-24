import './design.css';
import './operations-theme.css';

if (window.parent !== window && document.referrer && new URL(document.referrer).origin === location.origin) {
  const host = window.parent.document.documentElement;
  const syncTheme = () => {
    document.documentElement.dataset.theme = host.dataset.theme;
    document.documentElement.dataset.accent = host.dataset.accent;
  };
  syncTheme();
  new MutationObserver(syncTheme).observe(host, {
    attributes: true, attributeFilter: ['data-theme', 'data-accent']
  });
}
