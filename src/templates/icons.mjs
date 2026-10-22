import { raw } from '../lib/html.mjs';

// 24x24 stroke icons. Family glyphs are drawn for this site; UI icons are plain geometry.
const P = {
  busbar: '<rect x="2.5" y="5" width="19" height="3.2" rx=".6"/><rect x="2.5" y="10.4" width="19" height="3.2" rx=".6"/><rect x="2.5" y="15.8" width="19" height="3.2" rx=".6"/><circle cx="7" cy="6.6" r=".7"/><circle cx="7" cy="12" r=".7"/><circle cx="7" cy="17.4" r=".7"/>',
  insulator: '<path d="M8 3h8v3H8z"/><path d="M9.5 6h5l1.2 12H8.3z"/><path d="M6 18h12v3H6z"/><path d="M12 8v6"/>',
  lug: '<circle cx="7" cy="12" r="4.2"/><circle cx="7" cy="12" r="1.5"/><path d="M11.2 9.6 21 9.6v4.8l-9.8 0"/><path d="M15 9.6v4.8"/>',
  rail: '<path d="M2.5 9h4.5v-3.5h10V9h4.5v3.2H2.5z"/><rect x="9" y="14.5" width="6" height="2.2" rx="1.1"/><path d="M2.5 20h19"/>',
  duct: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M6 6v4M9 6v4M12 6v4M15 6v4M18 6v4M6 18v-4M9 18v-4M12 18v-4M15 18v-4M18 18v-4"/>',
  earth: '<path d="M12 2.5v13"/><path d="m10 15.5 2 4 2-4"/><path d="M4 20.5h16M7 22.5h10"/><path d="M8.5 7h7"/>',
  download: '<path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M4 19.5h16"/>',
  arrow: '<path d="M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5"/>',
  arrowLeft: '<path d="M20 12H5m0 0 5.5-5.5M5 12l5.5 5.5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  chevronDown: '<path d="m5 9 7 7 7-7"/>',
  phone: '<path d="M5 4h4l1.6 4.2-2.3 1.5a11 11 0 0 0 5.9 5.9l1.5-2.3L20 15v4a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m3.5 7 8.5 6.5L20.5 7"/>',
  pin: '<path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5"/>',
  menu: '<path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  file: '<path d="M6 2.5h8.5L19 7v14.5H6z"/><path d="M14 2.5V7.5h5"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5M10.5 8v5M8 10.5h5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5.5H5V6.5h5.5"/>',
  bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
};
export function icon(name, cls = '') {
  return raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`);
}
