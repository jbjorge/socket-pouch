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
import overrideApi from './override-api';
const isBrowser = typeof process === 'undefined' || process.browser;
const log = createDebugLog('pouchdb:socket:client');
const sockets = {};

// Implements the PouchDB API for dealing with CouchDB instances over WS
export default function SocketPouch(constructorOptions, callback) {
  const pouchInstance = this;
  const instanceOptions = getOptions(constructorOptions);
  log('constructor called', instanceOptions);

  if (!instanceOptions.url || !instanceOptions.name) {
    return callback(new Error('Error: you must provide a web socket url and database name.'));
  }

  function getSocketInstance(options, callback) {
    pouchInstance._callbacks = {};
    pouchInstance._changesListeners = {};
    pouchInstance._blobs = {};
    pouchInstance._binaryMessages = {};
    pouchInstance._name = pouchInstance.name || instanceOptions.originalName;
    let socket = pouchInstance._socket = sockets[instanceOptions.url];
    if (!socket) {
      sockets[instanceOptions.url] = new Socket(options.url, options.socketOptions || {});
      sockets[instanceOptions.url].binaryType = 'blob';
      pouchInstance._socket = socket = sockets[instanceOptions.url];
      socket.on('connect', onConnected);
    } else {
      onConnected();
    }

    function onConnected() {
      pouchInstance._socketId = socket.id;
      log('socket opened', pouchInstance._socketId, pouchInstance._name);

      if (options.connectionEmitters) {
        options.connectionEmitters.map(function(emitter) {
          socket.emit(emitter.name, emitter.value)
        });
      }

      if (instanceOptions.skip_setup) {
        callback(null, pouchInstance);
      } else {
        let serverOpts = {
          name: pouchInstance._name,
          auto_compaction: !!options.auto_compaction
        };
        if ('revs_limit' in options) {
          serverOpts.revs_limit = options.revs_limit;
        }
        sendMessage('createDatabase', [serverOpts], function(err) {
          if (err) {
            return callback(err);
          }
          callback(null, pouchInstance);
        });
      }
    }

    pouchInstance._socket.on('error', function(err) {
      callback(err);
    });

    function handleUncaughtError(content) {
      try {
        pouchInstance.emit('error', content);
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

      let cb = pouchInstance._callbacks[messageId];

      if (!cb) {
        log('duplicate message or message to different db (ignoring)', messageId, messageType, content);
        return;
      }

      log('receive message', pouchInstance._socketId, messageId, messageType, content);

      if (messageType === '0') { // error
        delete pouchInstance._callbacks[messageId];
        cb(content);
      } else if (messageType === '1') { // success
        delete pouchInstance._callbacks[messageId];
        cb(null, content);
      } else if (messageType === '2') { // update, i.e. changes
        if (pouchInstance._changesListeners[messageId].asBinary) {
          readAttachmentsAsBlobOrBuffer(content);
        }
        pouchInstance._changesListeners[messageId].listener(content);
      } else { // binary success
        delete pouchInstance._callbacks[messageId];
        receiveBinaryMessage(content, cb);
      }
    }

    function receiveBinaryMessage(content, cb) {
      log('receiveBinaryMessage', content.uuid);
      pouchInstance._binaryMessages[content.uuid] = {
        contentType: content.type,
        cb: cb
      };
      checkBinaryReady(uuid);
    }

    function receiveBlob(blob) {
      if (isBrowser) {
        blobUtil.blobToBinaryString(blob.slice(0, 36)).then(function(uuid) {
          pouchInstance._blobs[uuid] = blob.slice(36);
          log('receiveBlob', uuid);
          checkBinaryReady(uuid);
        }).catch(console.log.bind(console));
      } else {
        let uuid = blob.slice(0, 36).toString('utf8');
        log('receiveBlob', uuid);
        pouchInstance._blobs[uuid] = blob.slice(36);
        checkBinaryReady(uuid);
      }
    }

    // binary messages come in two parts; wait until we've received both
    function checkBinaryReady(uuid) {
      if (!(uuid in pouchInstance._blobs && uuid in pouchInstance._binaryMessages)) {
        return;
      }
      log('receive full binary message', uuid);
      let blob = pouchInstance._blobs[uuid];
      let msg = pouchInstance._binaryMessages[uuid];

      delete pouchInstance._blobs[uuid];
      delete pouchInstance._binaryMessages[uuid];

      let blobToDeliver;
      if (isBrowser) {
        blobToDeliver = blobUtil.createBlob([blob], { type: msg.contentType });
      } else {
        blobToDeliver = blob;
        blob.type = msg.contentType; // non-standard, but we do it for the tests
      }

      msg.cb(null, blobToDeliver);
    }

    pouchInstance._socket.on('message', function(res) {
      if (typeof res !== 'string') {
        return receiveBlob(res);
      }
      receiveMessage(res);
    });

    return pouchInstance;
  }

  function sendMessage(type, args, callback) {
    if (pouchInstance._destroyed) {
      return callback(new Error('this db was destroyed'));
    } else if (pouchInstance._closed) {
      return callback(new Error('this db was closed'));
    }
    let messageId = uuid();
    log('send message', pouchInstance._socketId, messageId, type, args);
    pouchInstance._callbacks[messageId] = callback;
    let stringArgs = stringifyArgs(args);
    pouchInstance._socket.send(pouchInstance.name + ':' + type + ':' + messageId + ':' + stringArgs, function() {
      log('message sent', pouchInstance._socketId, messageId);
    });
  }

  function sendBinaryMessage(type, args, blobIndex, blob, callback) {
    let messageId = uuid();
    pouchInstance._callbacks[messageId] = callback;
    let header = {
      args: args,
      blobIndex: blobIndex,
      messageId: messageId,
      messageType: type
    };

    log('send binary message', pouchInstance._socketId, messageId, header);
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
    pouchInstance._socket.send(pouchInstance + ':' + blobToSend, function() {
      log('binary message sent', pouchInstance._socketId, messageId);
    });
  }

  pouchInstance._close = function(callback) {
    pouchInstance._closed = true;
    if (!sockets[instanceOptions.url]) { // already closed/destroyed
      return callback();
    }
    delete sockets[instanceOptions.url];
    close(pouchInstance, callback);
  };

  pouchInstance.destroy = adapterFun('destroy', function(opts, callback) {
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
        pouchInstance.emit('error', err);
        return callback(err);
      }
      pouchInstance._destroyed = true;
      close(pouchInstance, function(err) {
        if (err) {
          pouchInstance.emit('error', err);
          return callback(err);
        }
        pouchInstance.emit('destroyed');
        callback(null, res);
      });
    });
  });

  overrideApi(pouchInstance, callback, sendMessage, sendBinaryMessage);

  // this is the thing that sets up the whole shebang
  getSocketInstance(instanceOptions, callback);
}

// SocketPouch is a valid adapter.
SocketPouch.valid = function() {
  return true;
};

function close(pouchInstance, callback) {
  // pouchInstance.name was added in pouchdb 6.0.0
  log('closing socket', pouchInstance._socketId, pouchInstance.name || pouchInstance._name);

  function closeSocket() {
    pouchInstance._socket.closed = true;
    pouchInstance._socket.once('close', function(msg) {
      log('socket closed', pouchInstance._socketId, msg);
      pouchInstance._socket.removeAllListeners();
      callback();
    });
    pouchInstance._socket.close();
  }

  if (pouchInstance._socket.closed) {
    return callback();
  }
  closeSocket();
}

/* istanbul ignore next */
if (typeof window !== 'undefined' && window.PouchDB) {
  window.PouchDB.adapter('socket', SocketPouch);
}