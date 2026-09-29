import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns';

// Pin each connection to a public IPv4 result, including after redirects.
// Intake URLs must never be able to reach loopback, private networks or metadata.
export function publicIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) ||
    (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
}

export async function readPublicPage(input, redirects = 0) {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || redirects > 3) return null;
    // Numeric hosts can bypass Node's lookup callback.
    if (/^[\d.]+$/.test(url.hostname) && !publicIPv4(url.hostname)) return null;
    if (url.hostname.includes(':')) return null;
    return await new Promise(resolve => {
      let settled = false;
      const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
      const request = (url.protocol === 'https:' ? https : http).get(url, {
        headers: { 'User-Agent': 'Kanso-Genesis/1.0', 'Accept': 'text/html' },
        lookup(hostname, options, callback) {
          lookup(hostname, { family: 4, all: true }, (error, addresses) => {
            if (error || !addresses?.length || addresses.some(a => !publicIPv4(a.address))) {
              callback(error || new Error('Non-public host')); return;
            }
            if (options.all) callback(null, addresses);
            else callback(null, addresses[0].address, 4);
          });
        },
      }, response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          let next;
          try { next = new URL(response.headers.location, url).href; } catch { finish(null); return; }
          finish(readPublicPage(next, redirects + 1)); return;
        }
        if (response.statusCode !== 200) { response.resume(); finish(null); return; }
        let html = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          html += chunk;
          if (html.length >= 30000) { finish(html.slice(0, 30000)); response.destroy(); }
        });
        response.on('end', () => finish(html));
        response.on('error', () => finish(null));
      });
      const timer = setTimeout(() => { finish(null); request.destroy(); }, 8000);
      request.on('error', () => finish(null));
    });
  } catch { return null; }
}
