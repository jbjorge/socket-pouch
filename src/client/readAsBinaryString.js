'use strict';

export default function (buffer, callback) {
  process.nextTick(function () {
    callback(buffer.toString('binary'));
  });
}