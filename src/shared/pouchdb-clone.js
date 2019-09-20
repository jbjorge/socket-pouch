'use strict';

let isBinaryObject = require('./isBinaryObject');
let cloneBinaryObject = require('./cloneBinaryObject');
if (isBinaryObject.default) { isBinaryObject = isBinaryObject.default; }
if (cloneBinaryObject.default) { cloneBinaryObject = cloneBinaryObject.default; }

module.exports = function clone(object) {
  let newObject;
  let i;
  let len;

  if (!object || typeof object !== 'object') {
    return object;
  }

  if (Array.isArray(object)) {
    newObject = [];
    for (i = 0, len = object.length; i < len; i++) {
      newObject[i] = clone(object[i]);
    }
    return newObject;
  }

  // special case: to avoid inconsistencies between IndexedDB
  // and other backends, we automatically stringify Dates
  if (object instanceof Date) {
    return object.toISOString();
  }

  if (isBinaryObject(object)) {
    return cloneBinaryObject(object);
  }

  newObject = {};
  for (i in object) {
    if (Object.prototype.hasOwnProperty.call(object, i)) {
      let value = clone(object[i]);
      if (typeof value !== 'undefined') {
        newObject[i] = value;
      }
    }
  }
  return newObject;
};
