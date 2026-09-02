'use strict';
// Base path helper — GitHub Pages subfolder safe
window.getAppBasePath = function () {
  const path = window.location.pathname || '/';
  const file = path.split('/').pop() || '';
  if (file.includes('.')) {
    const idx = path.lastIndexOf('/');
    return idx <= 0 ? '' : path.substring(0, idx);
  }
  return path.endsWith('/') ? path.slice(0, -1) : path;
};

window.appUrl = function (relativePath) {
  const base = window.getAppBasePath();
  const rel = String(relativePath || '').replace(/^\//, '');
  return (base ? base + '/' : '/') + rel;
};

window.appAssetUrl = function (relativePath) {
  return window.appUrl(relativePath);
};
