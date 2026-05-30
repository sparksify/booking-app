/**
 * lib/fbPixel.js
 *
 * Client-side Facebook Pixel helper.
 * Only fires if NEXT_PUBLIC_FB_PIXEL_ID is set.
 *
 * Usage (in _app.js or any page):
 *   import { initPixel, pixelEvent, pixelTrack } from '@/lib/fbPixel';
 */

export const PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID || '';

/** Inject the FB Pixel base code and fire PageView. Call once on mount. */
export function initPixel() {
  if (!PIXEL_ID || typeof window === 'undefined') return;
  if (window._fbPixelInit) return; // already initialized
  window._fbPixelInit = true;

  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');
}

/**
 * Fire a standard FB Pixel event.
 * @param {string} eventName  - e.g. 'Lead', 'Schedule', 'ViewContent'
 * @param {object} params     - optional event parameters
 */
export function pixelTrack(eventName, params = {}) {
  if (!PIXEL_ID || typeof window === 'undefined' || !window.fbq) return;
  window.fbq('track', eventName, params);
}

/**
 * Fire a custom FB Pixel event.
 * @param {string} eventName  - your custom event name
 * @param {object} params
 */
export function pixelEvent(eventName, params = {}) {
  if (!PIXEL_ID || typeof window === 'undefined' || !window.fbq) return;
  window.fbq('trackCustom', eventName, params);
}
