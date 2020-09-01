'use strict';

let utils = require('../shared/utils');
let log = require('debug')('pouchdb:socket:client');
let isBrowser = typeof process === 'undefined' || process.browser;

export function preprocessAttachments(doc) {
  if (!doc._attachments || !Object.keys(doc._attachments)) {
    return utils.Promise.resolve();
  }

  let atts = doc._attachments;
  return utils.Promise.all(Object.keys(atts).map(function (key) {
    let att = atts[key];
    if (att.data && typeof att.data !== 'string') {
      if (isBrowser) {
        return new utils.Promise(function (resolve) {
          utils.readAsBinaryString(att.data, function (binary) {
            att.data = utils.btoa(binary);
            resolve();
          });
        });
      } else {
        att.data = att.data.toString('base64');
      }
    }
  }));
}

let b64StringToBluffer = require('./base64StringToBlobOrBuffer');

export function readAttachmentsAsBlobOrBuffer(row) {
  let atts = (row.doc && row.doc._attachments) ||
    (row.ok && row.ok._attachments);
  if (!atts) {
    return;
  }
  Object.keys(atts).forEach(function (filename) {
    let att = atts[filename];
    att.data = b64StringToBluffer(att.data, att.content_type);
  });
}

export function stringifyArgs(args) {
  let funcArgs = ['filter', 'map', 'reduce'];
  args.forEach(function (arg) {
    if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
      funcArgs.forEach(function (funcArg) {
        if (funcArg in arg && typeof arg[funcArg] === 'function') {
          arg[funcArg] = {
            type: 'func',
            func: arg[funcArg].toString()
          };
        }
      });
    }
  });
  return JSON.stringify(args);
}

export function padInt(i, len) {
  let res = i.toString();
  while (res.length < len) {
    res = '0' + res;
  }
  return res;
}


export function adapterFun(name, callback) {

  function logApiCall(self, name, args) {
    if (!log.enabled) {
      return;
    }
    // db.name was added in pouch 6.0.0
    let dbName = self.name || self._db_name;
    let logArgs = [dbName, name];
    for (let i = 0; i < args.length - 1; i++) {
      logArgs.push(args[i]);
    }
    log.apply(null, logArgs);

    // override the callback itself to log the response
    let origCallback = args[args.length - 1];
    args[args.length - 1] = function (err, res) {
      let responseArgs = [dbName, name];
      responseArgs = responseArgs.concat(
        err ? ['error', err] : ['success', res]
      );
      log.apply(null, responseArgs);
      origCallback(err, res);
    };
  }


  return utils.toPromise(utils.getArguments(function (args) {
    if (this._closed) {
      return utils.Promise.reject(new Error('database is closed'));
    }
    let self = this;
    logApiCall(self, name, args);
    if (!this.taskqueue.isReady) {
      return new utils.Promise(function (fulfill, reject) {
        self.taskqueue.addTask(function (failed) {
          if (failed) {
            reject(failed);
          } else {
            fulfill(self[name].apply(self, args));
          }
        });
      });
    }
    return callback.apply(this, args);
  }));
}