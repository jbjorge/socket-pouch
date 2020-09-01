'use strict';

let buffer = require('../shared/buffer');

export function atob(str) {
  if (typeof window.atob === 'function') {
    return window.atob(str);
  }
  let base64 = new buffer(str, 'base64');
  // Node.js will just skip the characters it can't encode instead of
  // throwing and exception
  if (base64.toString('base64') !== str) {
    throw ("Cannot base64 encode full string");
  }
  return base64.toString('binary');
}

export function btoa(str) {
  if (typeof window.btoa === 'function') {
    return window.btoa(str);
  }
  return new buffer(str, 'binary').toString('base64');
}

export default { atob, btoa };