// The distributed upstream Flutter bundle only registers en and zh-CN.
// Redirect its English asset to our complete Portuguese catalog for pt locales.
// Keep upstream English intact for other locales; never patch minified Dart code.
(() => {
  if (!/^pt(?:[-_]|$)/i.test(new URLSearchParams(location.search).get('locale') || '')) return;
  document.documentElement.lang = 'pt-BR';
  const english = '/web/flutter_web/assets/assets/i10n/en.json';
  function localized(value) {
    try {
      const url = new URL(String(value), location.href);
      if (url.origin === location.origin && url.pathname === english) {
        url.pathname = english.replace('en.json', 'pt-BR.json'); return url.href;
      }
    } catch { /* Preserve native error handling for malformed URLs. */ }
    return value;
  }
  const fetchOriginal = window.fetch;
  window.fetch = function(input, options) {
    if (input instanceof Request) {
      const next = localized(input.url);
      if (next !== input.url) input = new Request(next, input);
    } else input = localized(input);
    return fetchOriginal.call(this, input, options);
  };
  const openOriginal = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    return openOriginal.call(this, method, localized(url), ...rest);
  };
  function overlay() {
    const labels = {'.flutter-error__title':'Falha ao carregar', '.flutter-error__desc':'Os recursos não carregaram no tempo esperado. Reinicie o aplicativo e tente novamente.', '.flutter-error__reload':'Recarregar', '.flutter-loading__text':'Carregando…'};
    for (const [selector,text] of Object.entries(labels)) {
      const element = document.querySelector(selector); if(element) element.textContent = text;
    }
  }
  document.addEventListener('DOMContentLoaded', overlay);
})();
