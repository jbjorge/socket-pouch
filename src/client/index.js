import utils from '../shared/utils';
import {
  stringifyArgs,
  padInt,
  readAttachmentsAsBlobOrBuffer,
  adapterFun
} from './utils';
import uuid from './../shared/uuid';
import createDebugLog from 'debug';
import Socket from 'socket.io-client';
import blobUtil from 'blob-util';
import buffer from '../shared/buffer';
import getOptions from './get-options';
import getSocketName from './api/get-socket-name';
import overrideApi from './override-api';
const isBrowser = typeof process === 'undefined' || process.browser;
const log = createDebugLog('pouchdb:socket:client');
const sockets = {};

// Implements the PouchDB API for dealing with CouchDB instances over WS
export default function SocketPouch(constructorOptions, callback) {
  let api = this;
  let instanceOptions = getOptions(constructorOptions);
  log('constructor called', instanceOptions);

  if (!instanceOptions.url || !instanceOptions.name) {
    return callback(new Error('Error: you must provide a web socket url and database name.'));
  }

  function useExistingSocket(cachedAPI, callback) {
    log("REUSED SOCKET!!!!! :D :D :D");
    api._socket = cachedAPI._socket;
    api._callbacks = cachedAPI._callbacks;
    api._changesListeners = cachedAPI._changesListeners;
    api._blobs = cachedAPI._blobs;
    api._binaryMessages = cachedAPI._binaryMessages;
    api._name = cachedAPI._name;

    if (cachedAPI._socketId) {
      api._socketId = cachedAPI._socketId;
      process.nextTick(function() {
        callback(null, api);
      });
    } else {
      api._socket.on('connect', function() {
        api._socketId = api._socket.id;
        process.nextTick(function() {
          callback(null, api);
        });
      });
    }
  }

  function createNewSocket(options, callback) {
    log("NEW SOCKET!!!!!!!!!!!!!!!!!!!!!!!!!");
    // to force XHR during debugging
    // options.socketOptions = {transports: ['polling']};
    let socket = api._socket = new Socket(options.url, options.socketOptions || {});
    socket.binaryType = 'blob';
    api._callbacks = {};
    api._changesListeners = {};
    api._blobs = {};
    api._binaryMessages = {};
    api._name = api._socketName;

    socket.on('connect', function() {
      api._socketId = socket.id;
      log('socket opened', api._socketId, api._name);

      if (options.connectionEmitters) {
        options.connectionEmitters.map(function(emitter) {
          socket.emit(emitter.name, emitter.value)
        });
      }

      let serverOpts = {
        name: api._name,
        auto_compaction: !!options.auto_compaction
      };
      if ('revs_limit' in options) {
        serverOpts.revs_limit = options.revs_limit;
      }
      if (options.skip_setup) {
        callback(null, api);
      } else {
        sendMessage('createDatabase', [serverOpts], function(err) {
          if (err) {
            return callback(err);
          }
          callback(null, api);
        });
      }
    });

    api._socket.on('error', function(err) {
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
      let split = utils.parseMessage(res, 3);
      let messageId = split[0];
      let messageType = split[1];
      let content = JSON.parse(split[2]);

      if (messageType === '4') { // unhandled error
        handleUncaughtError(content);
        return;
      }

      let cb = api._callbacks[messageId];

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
        blobUtil.blobToBinaryString(blob.slice(0, 36)).then(function(uuid) {
          api._blobs[uuid] = blob.slice(36);
          log('receiveBlob', uuid);
          checkBinaryReady(uuid);
        }).catch(console.log.bind(console));
      } else {
        let uuid = blob.slice(0, 36).toString('utf8');
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
      let blob = api._blobs[uuid];
      let msg = api._binaryMessages[uuid];

      delete api._blobs[uuid];
      delete api._binaryMessages[uuid];

      let blobToDeliver;
      if (isBrowser) {
        blobToDeliver = blobUtil.createBlob([blob], { type: msg.contentType });
      } else {
        blobToDeliver = blob;
        blob.type = msg.contentType; // non-standard, but we do it for the tests
      }

      msg.cb(null, blobToDeliver);
    }

    api._socket.on('message', function(res) {
      if (typeof res !== 'string') {
        return receiveBlob(res);
      }
      receiveMessage(res);
    });

    return api;
  }

  function sendMessage(type, args, callback) {
    if (api._destroyed) {
      return callback(new Error('this db was destroyed'));
    } else if (api._closed) {
      return callback(new Error('this db was closed'));
    }
    let messageId = uuid();
    log('send message', api._socketId, messageId, type, args);
    api._callbacks[messageId] = callback;
    let stringArgs = stringifyArgs(args);
    api._socket.send(type + ':' + messageId + ':' + stringArgs, function() {
      log('message sent', api._socketId, messageId);
    });
  }

  function sendBinaryMessage(type, args, blobIndex, blob, callback) {
    let messageId = uuid();
    api._callbacks[messageId] = callback;
    let header = {
      args: args,
      blobIndex: blobIndex,
      messageId: messageId,
      messageType: type
    };

    log('send binary message', api._socketId, messageId, header);
    let headerString = JSON.stringify(header);
    let headerLen = padInt(headerString.length, 16);
    let blobToSend;
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
    api._socket.send(blobToSend, function() {
      log('binary message sent', api._socketId, messageId);
    });
  }

  api._close = function(callback) {
    api._closed = true;
    if (!sockets[instanceOptions.url]) { // already closed/destroyed
      return callback();
    }
    delete sockets[instanceOptions.url];
    close(api, callback);
  };

  api.destroy = adapterFun('destroy', function(opts, callback) {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }

    if (!sockets[instanceOptions.url]) { // already closed/destroyed
      return callback(null, { ok: true });
    }
    delete sockets[instanceOptions.url];
    sendMessage('destroy', [], function(err, res) {
      if (err) {
        api.emit('error', err);
        return callback(err);
      }
      api._destroyed = true;
      close(api, function(err) {
        if (err) {
          api.emit('error', err);
          return callback(err);
        }
        api.emit('destroyed');
        callback(null, res);
      });
    });
  });

  api._socketName = getSocketName(api, instanceOptions);

  overrideApi(api, callback, sendMessage, sendBinaryMessage);

  if (sockets[instanceOptions.url]) {
    useExistingSocket(sockets[instanceOptions.url], instanceOptions, callback);
  } else {
    sockets[instanceOptions.url] = createNewSocket(instanceOptions, callback);
  }
}

// SocketPouch is a valid adapter.
SocketPouch.valid = function() {
  return true;
};

function close(api, callback) {
  // api.name was added in pouchdb 6.0.0
  log('closing socket', api._socketId, api.name || api._name);

  function closeSocket() {
    api._socket.closed = true;
    api._socket.once('close', function(msg) {
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

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.adapter('socket', SocketPouch);
}