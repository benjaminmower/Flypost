/*
  Concierge loader (auto-generated).
  Fetches manifest.json (no-cache) and injects CSS then JS into the page.
  This file should be short-cached (low TTL).
*/
(function () {
  async function load() {
    try {
      var res = await fetch('/manifest.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
      var manifest = await res.json();

      // inject CSS
      if (Array.isArray(manifest.css)) {
        manifest.css.forEach(function (cssPath) {
          try {
            var l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = '/' + cssPath.replace(/^[\/]+/, '');
            l.crossOrigin = 'anonymous';
            document.head.appendChild(l);
          } catch (e) { console.error('Failed to inject css', e); }
        });
      }

      // inject JS
      if (manifest.js) {
        var s = document.createElement('script');
        s.src = '/' + manifest.js.replace(/^[\/]+/, '');
        s.async = true;
        s.crossOrigin = 'anonymous';
        document.body.appendChild(s);
      }
    } catch (err) {
      console.error('Concierge loader error:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();