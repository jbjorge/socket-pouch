'use strict';

var binaryStringToBlobOrBuffer = require('./binaryStringToBlobOrBuffer');

export default function (b64, type) {
  return binaryStringToBlobOrBuffer(atob(b64), type);
};