'use strict';

module.exports = function cloneBinaryObject(object) {
  let copy = new Buffer(object.length);
  object.copy(copy);
  return copy;
};