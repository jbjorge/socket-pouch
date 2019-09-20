'use strict';

let Promise = require('pouchdb-promise');
let buffer = require('./buffer');
if (Promise.default) { Promise = Promise.default; }
if (buffer.default) { buffer = buffer.default; }

exports.lastIndexOf = function lastIndexOf(str, char) {
  for (let i = str.length - 1; i >= 0; i--) {
    if (str.charAt(i) === char) {
      return i;
    }
  }
  return -1;
};

exports.clone = require('./pouchdb-clone').default || require('./pouchdb-clone');

exports.parseMessage = require('./parse-message').default || require('./parse-message');

/* istanbul ignore next */
exports.once = function once(fun) {
  let called = false;
  return exports.getArguments(function (args) {
    if (called) {
      console.trace();
      throw new Error('once called  more than once');
    } else {
      called = true;
      fun.apply(this, args);
    }
  });
};
/* istanbul ignore next */
exports.getArguments = function getArguments(fun) {
  return function () {
    let len = arguments.length;
    let args = new Array(len);
    let i = -1;
    while (++i < len) {
      args[i] = arguments[i];
    }
    return fun.call(this, args);
  };
};
/* istanbul ignore next */
exports.toPromise = function toPromise(func) {
  //create the function we will be returning
  return exports.getArguments(function (args) {
    let self = this;
    let tempCB = (typeof args[args.length - 1] === 'function') ? args.pop() : false;
    // if the last argument is a function, assume its a callback
    let usedCB;
    if (tempCB) {
      // if it was a callback, create a new callback which calls it,
      // but do so async so we don't trap any errors
      usedCB = function (err, resp) {
        process.nextTick(function () {
          tempCB(err, resp);
        });
      };
    }
    let promise = new Promise(function (fulfill, reject) {
      try {
        let callback = exports.once(function (err, mesg) {
          if (err) {
            reject(err);
          } else {
            fulfill(mesg);
          }
        });
        // create a callback for this invocation
        // apply the function in the orig context
        args.push(callback);
        func.apply(self, args);
      } catch (e) {
        reject(e);
      }
    });
    // if there is a callback, call it back
    if (usedCB) {
      promise.then(function (result) {
        usedCB(null, result);
      }, usedCB);
    }
    promise.cancel = function () {
      return this;
    };
    return promise;
  });
};

if (typeof atob === 'function') {
  exports.atob = function atobShim(str) {
    return atob(str);
  };
} else {
  exports.atob = function atobShim(str) {
    let base64 = new buffer(str, 'base64');
    // Node.js will just skip the characters it can't encode instead of
    // throwing and exception
    if (base64.toString('base64') !== str) {
      throw ("Cannot base64 encode full string");
    }
    return base64.toString('binary');
  };
}

if (typeof btoa === 'function') {
  exports.btoa = function btoaShim(str) {
    return btoa(str);
  };
} else {
  exports.btoa = function btoaShim(str) {
    return new buffer(str, 'binary').toString('base64');
  };
}

exports.inherits = require('inherits').default || require('inherits');
exports.Promise = Promise;

let binUtil = require('pouchdb-binary-util').default || require('pouchdb-binary-util');

exports.createBlob = binUtil.createBlob;
exports.readAsArrayBuffer = binUtil.readAsArrayBuffer;
exports.readAsBinaryString = binUtil.readAsBinaryString;
exports.binaryStringToArrayBuffer = binUtil.binaryStringToArrayBuffer;
exports.arrayBufferToBinaryString = binUtil.arrayBufferToBinaryString;