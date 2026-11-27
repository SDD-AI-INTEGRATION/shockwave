(() => {
  try {
    if (/^#(?:login|reset\/)/.test(location.hash)) return;
    const {theme,accent}=JSON.parse(localStorage.getItem('shockwave:appearance') || '{}');
    if (!['light','dark','system'].includes(theme) || !['shockwave','violet','teal','green','orange','red','graphite'].includes(accent)) return;
    const dark=theme==='dark'||(theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.documentElement.dataset.accent=accent;
    document.querySelector('meta[name="theme-color"]').content=dark?'#111528':'#f6f7fb';
  } catch {}
})();
