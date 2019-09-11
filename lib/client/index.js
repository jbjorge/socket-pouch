'use strict';

var utils = require('../shared/utils');
var clientUtils = require('./utils');
var uuid = require('./../shared/uuid');
var errors = require('../shared/errors');
var log = require('debug')('pouchdb:socket:client');
var Socket = require('socket.io-client');
var blobUtil = require('blob-util');
var isBrowser = typeof process === 'undefined' || process.browser;
var buffer = require('../shared/buffer');
var preprocessAttachments = clientUtils.preprocessAttachments;
var stringifyArgs = clientUtils.stringifyArgs;
var padInt = clientUtils.padInt;
var readAttachmentsAsBlobOrBuffer = clientUtils.readAttachmentsAsBlobOrBuffer;
var adapterFun = clientUtils.adapterFun;
var readAsBinaryString = require('./readAsBinaryString');
var isBinaryObject = require('../shared/isBinaryObject');
var Promise = require('pouchdb-promise');
var base64 = require('./base64');
var getOptions = require('./get-options');
var overrideApi = require('./override-api');

var instances = {};
var socketInstance = {};

function close(api, callback) {
  // api.name was added in pouchdb 6.0.0
  log('closing socket', api._socketId, api.name || api._name);

  function closeSocket() {
    api._socket.closed = true;
    api._socket.once('close', function (msg) {
      log('socket closed', api._socketId, msg);
      api._socket.removeAllListeners();
      callback();
    });
    api._socket.close();
  }

  if (api._socket.closed) {
    return callback();
  }
  closeSocket();
}

// Implements the PouchDB API for dealing with CouchDB instances over WS
function SocketPouch(options, callback) {
  log('constructor called', opts);
  var api = this;
  var opts = getOptions(options);

  if (!opts.url || !opts.name) {
    return callback(new Error('Error: you must provide a web socket url and database name.'));
  }

  var cacheKey = '$' + api._socketName;

  function useExistingSocket() {
    // Re-use the cached one instead of creating multiple sockets.
    // This is important, because if a user creates many PouchDBs
    // without closing/destroying each one, then we could end up
    // with too many open sockets, which causes problems like
    // https://github.com/Automattic/engine.io/issues/320
    var instance = instances[cacheKey];
    api._socket = instance._socket;
    api._callbacks = instance._callbacks;
    api._changesListeners = instance._changesListeners;
    api._blobs = instance._blobs;
    api._binaryMessages = instance._binaryMessages;
    api._name = instance._name;

    if (instance._socketId) {
      api._socketId = instance._socketId;
      process.nextTick(function () {
        callback(null, api);
      });
    } else {
      api._socket.on('connect', function () {
        api._socketId = api._socket.id;
        process.nextTick(function () {
          callback(null, api);
        });
      });
    }
  }

  function createNewSocket() {
    console.log('Creating new socket!');
    // to force XHR during debugging
    // opts.socketOptions = {transports: ['polling']};
    var socket = api._socket = new Socket(opts.url, opts.socketOptions || {});
    socket.binaryType = 'blob';
    api._callbacks = {};
    api._changesListeners = {};
    api._blobs = {};
    api._binaryMessages = {};
    api._name = api._socketName;
    instances[cacheKey] = api;

    socket.on('connect', function () {
      api._socketId = socket.id;
      log('socket opened', api._socketId, api._name);

      if (opts.connectionEmitters) {
        opts.connectionEmitters.map(function (emitter) {
          socket.emit(emitter.name, emitter.value)
        });
      }

      var serverOpts = {
        name: api._name,
        auto_compaction: !!opts.auto_compaction
      };
      if ('revs_limit' in opts) {
        serverOpts.revs_limit = opts.revs_limit;
      }
      sendMessage('createDatabase', [serverOpts], function (err) {
        if (err) {
          return callback(err);
        }
        callback(null, api);
      });
    });

    api._socket.on('error', function (err) {
      callback(err);
    });

    function handleUncaughtError(content) {
      try {
        api.emit('error', content);
      } catch (err) {
        // TODO: it's weird that adapters should have to handle this themselves
        console.error(
          'The user\'s map/reduce function threw an uncaught error.\n' +
          'You can debug this error by doing:\n' +
          'myDatabase.on(\'error\', function (err) { debugger; });\n' +
          'Please double-check your map/reduce function.');
        console.error(content);
      }
    }

    function receiveMessage(res) {
      var split = utils.parseMessage(res, 3);
      var messageId = split[0];
      var messageType = split[1];
      var content = JSON.parse(split[2]);

      if (messageType === '4') { // unhandled error
        handleUncaughtError(content);
        return;
      }

      var cb = api._callbacks[messageId];

      if (!cb) {
        log('duplicate message (ignoring)', messageId, messageType, content);
        return;
      }

      log('receive message', api._socketId, messageId, messageType, content);

      if (messageType === '0') { // error
        delete api._callbacks[messageId];
        cb(content);
      } else if (messageType === '1') { // success
        delete api._callbacks[messageId];
        cb(null, content);
      } else if (messageType === '2') { // update, i.e. changes
        if (api._changesListeners[messageId].asBinary) {
          readAttachmentsAsBlobOrBuffer(content);
        }
        api._changesListeners[messageId].listener(content);
      } else { // binary success
        delete api._callbacks[messageId];
        receiveBinaryMessage(content, cb);
      }
    }

    function receiveBinaryMessage(content, cb) {
      log('receiveBinaryMessage', content.uuid);
      api._binaryMessages[content.uuid] = {
        contentType: content.type,
        cb: cb
      };
      checkBinaryReady(uuid);
    }

    function receiveBlob(blob) {
      if (isBrowser) {
        blobUtil.blobToBinaryString(blob.slice(0, 36)).then(function (uuid) {
          api._blobs[uuid] = blob.slice(36);
          log('receiveBlob', uuid);
          checkBinaryReady(uuid);
        }).catch(console.log.bind(console));
      } else {
        var uuid = blob.slice(0, 36).toString('utf8');
        log('receiveBlob', uuid);
        api._blobs[uuid] = blob.slice(36);
        checkBinaryReady(uuid);
      }
    }

    // binary messages come in two parts; wait until we've received both
    function checkBinaryReady(uuid) {
      if (!(uuid in api._blobs && uuid in api._binaryMessages)) {
        return;
      }
      log('receive full binary message', uuid);
      var blob = api._blobs[uuid];
      var msg = api._binaryMessages[uuid];

      delete api._blobs[uuid];
      delete api._binaryMessages[uuid];

      var blobToDeliver;
      if (isBrowser) {
        blobToDeliver = blobUtil.createBlob([blob], {type: msg.contentType});
      } else {
        blobToDeliver = blob;
        blob.type = msg.contentType; // non-standard, but we do it for the tests
      }

      msg.cb(null, blobToDeliver);
    }

    api._socket.on('message', function (res) {
      if (typeof res !== 'string') {
        return receiveBlob(res);
      }
      receiveMessage(res);
    });
  }

  function sendMessage(type, args, callback) {
    if (api._destroyed) {
      return callback(new Error('this db was destroyed'));
    } else if (api._closed) {
      return callback(new Error('this db was closed'));
    }
    var messageId = uuid();
    log('send message', api._socketId, messageId, type, args);
    api._callbacks[messageId] = callback;
    var stringArgs = stringifyArgs(args);
    api._socket.send(type + ':' + messageId + ':' + stringArgs, function () {
      log('message sent', api._socketId, messageId);
    });
  }

  function sendBinaryMessage(type, args, blobIndex, blob, callback) {
    var messageId = uuid();
    api._callbacks[messageId] = callback;
    var header = {
      args: args,
      blobIndex: blobIndex,
      messageId: messageId,
      messageType: type
    };

    log('send binary message', api._socketId, messageId, header);
    var headerString = JSON.stringify(header);
    var headerLen = padInt(headerString.length, 16);
    var blobToSend;
    if (isBrowser) {
      blobToSend = blobUtil.createBlob([
        headerLen,
        headerString,
        blob
      ]);
    } else { // node.js
      blobToSend = buffer.concat([
        new buffer(headerLen, 'utf8'),
        new buffer(headerString, 'utf8'),
        new buffer(blob, 'binary')
      ]);
    }
    api._socket.send( blobToSend, function () {
      log('binary message sent', api._socketId, messageId);
    });
  }

  overrideApi(api, sendMessage, sendBinaryMessage);

  if (instances[cacheKey]) {
    useExistingSocket();
  } else { // new DB
    createNewSocket();
  }
}

// SocketPouch is a valid adapter.
SocketPouch.valid = function () {
  return true;
};

module.exports = SocketPouch;

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.adapter('socket', module.exports);
}
