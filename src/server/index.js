'use strict';

let socketIO = require('socket.io');
let uuid = require('../shared/uuid');
let errors = require('../shared/errors');
let utils = require('../shared/utils');
let serverUtils = require('./utils');
let safeEval = require('./safe-eval');
let allChanges = {};

let log = require('debug')('pouchdb:socket:server');

function destringifyArgs(argsString) {
  let args = JSON.parse(argsString);
  let funcArgs = ['filter', 'map', 'reduce'];
  args.forEach(function (arg) {
    if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
      funcArgs.forEach(function (funcArg) {
        if (typeof arg[funcArg] === 'undefined' || arg[funcArg] === null) {
          delete arg[funcArg];
        } else if (arg[funcArg].type === 'func' && arg[funcArg].func) {
          arg[funcArg] = safeEval(arg[funcArg].func);
        }
      });
    }
  });
  return args;
}

function sendUncaughtError(socket, data) {
  log(' -> sendUncaughtError', socket.id, data);
  socket.send('global:4:' + JSON.stringify(serverUtils.createError(data)));
}

function sendError(socket, messageId, data) {
  log(' -> sendError', socket.id, messageId, data);
  socket.send(messageId + ':0:' + JSON.stringify(serverUtils.createError(data)));
}

function sendSuccess(socket, messageId, data) {
  log(' -> sendSuccess', socket.id, messageId);
  socket.send(messageId + ':1:' + JSON.stringify(data));
}

function sendBinarySuccess(socket, messageId, type, buff) {
  log(' -> sendBinarySuccess', socket.id, messageId);
  let blobUuid = uuid();
  socket.send(messageId + ':3:' + JSON.stringify({type: type, uuid: blobUuid}));
  socket.send(Buffer.concat([
    new Buffer(blobUuid, 'utf8'),
    buff]));
}

function sendUpdate(socket, messageId, data) {
  log(' -> sendUpdate', socket.id, messageId);
  socket.send(messageId + ':2:' + JSON.stringify(data));
}

function dbMethod(socket, db, methodName, messageId, args) {
  log(methodName, messageId, args);
  if (!db) {
    return sendError(socket, messageId, {error: 'db not found'});
  }
  return db[methodName].apply(db, args)
    .then(res => sendSuccess(socket, messageId, res))
    .catch(err => sendError(socket, messageId, err));
}

function changes(socket, db, messageId, args) {
  let opts = args[0];
  if (opts && typeof opts === 'object') {
    // just send all the docs anyway because we need to emit change events
    // TODO: be smarter about emitting changes without building up an array
    opts.returnDocs = true;
    opts.return_docs = true;
    // just send binary as base64 and decode on the client
    opts.binary = false;
  }
  dbMethod(socket, db, 'changes', messageId, args);
}

function possiblyBinaryDbMethod(socket, db, methodName, messageId, args) {
  let opts = args[args.length - 1];
  if (opts && typeof opts === 'object') {
    // just send binary as base64 and decode on the client
    opts.binary = false;
  }
  dbMethod(socket, db, methodName, messageId, args);
}

function getAttachment(socket, db, messageId, args) {
  if (!db) {
    return sendError(socket, messageId, {error: 'db not found'});
  }

  let docId = args[0];
  let attId = args[1];
  let opts = args[2];
  if (typeof opts !== 'object') {
    opts = {};
  }
  return db.get(docId, opts)
    .then(doc => {
      if (!doc._attachments || !doc._attachments[attId]) {
        throw errors.MISSING_DOC;
      }
      let type = doc._attachments[attId].content_type;
      return db.getAttachment.apply(db, args)
        .then(buff => {
          sendBinarySuccess(socket, messageId, type, buff);
        });
    })
    .catch(err => sendError(socket, messageId, err));
}

function destroy(socket, db, messageId, args) {
  if (!db) {
    return sendError(socket, messageId, {error: 'db not found'});
  }

  return db.destroy.apply(db, args)
    .then(res => sendSuccess(socket, messageId, res))
    .catch(err => sendError(socket, messageId, err));
}

function liveChanges(socket, db, messageId, args) {
  if (!db) {
    return sendError(socket, messageId, {error: 'db not found'});
  }
  let opts = args[0] || {};
  // just send binary as base64 and decode on the client
  opts.binary = false;
  let changes = db.changes(opts);
  allChanges[messageId] = changes;
  changes.on('change', function (change) {
    sendUpdate(socket, messageId, change);
  })
    .on('complete', function (change) {
      changes.removeAllListeners();
      delete allChanges[messageId];
      sendSuccess(socket, messageId, change);
    })
    .on('error', function (change) {
      changes.removeAllListeners();
      delete allChanges[messageId];
      sendError(socket, messageId, change);
    });
}

function cancelChanges(messageId) {
  let changes = allChanges[messageId];
  if (changes) {
    changes.cancel();
  }
}

function addUncaughtErrorHandler(db, socket) {
  return db.then(function (res) {
    res.pouch.on('error', function (err) {
      sendUncaughtError(socket, err);
    });
  });
}

function createDatabase(socket, db, messageId, args) {
  if (db) {
    return sendError(socket, messageId, {
      error: "file_exists",
      reason: "The database could not be created, the file already exists."
    });
  }

  let name = typeof args[0] === 'string' ? args[0] : args[0].name;

  if (!name) {
    return sendError(socket, messageId, {
      error: 'you must provide a database name'
    });
  }

  addUncaughtErrorHandler(db, socket)
    .then(() => sendSuccess(socket, messageId, {ok: true}))
    .catch(err => sendError(socket, messageId, err));
}

function onReceiveMessage(socket, db, type, messageId, args) {
  log('onReceiveMessage', type, socket.id, messageId, args);
  switch (type) {
    case 'createDatabase':
      return createDatabase(socket, db, messageId, args);
    case 'id':
      sendSuccess(socket, messageId, socket.id);
      return;
    case 'info':
    case 'put':
    case 'bulkDocs':
    case 'post':
    case 'remove':
    case 'revsDiff':
    case 'compact':
    case 'viewCleanup':
    case 'removeAttachment':
    case 'putAttachment':
      return dbMethod(socket, db, type, messageId, args);
    case 'get':
    case 'query':
    case 'allDocs':
      return possiblyBinaryDbMethod(socket, db, type, messageId, args);
    case 'changes':
      return changes(socket, db, messageId, args);
    case 'getAttachment':
      return getAttachment(socket, db, messageId, args);
    case 'liveChanges':
      return liveChanges(socket, db, messageId, args);
    case 'cancelChanges':
      return cancelChanges(db, messageId);
    case 'destroy':
      return destroy(socket, db, messageId, args);
    default:
      return sendError(socket, messageId, {error: 'unknown API method: ' + type});
  }
}

function onReceiveTextMessage(message, socket, db) {
  try {
    let split = utils.parseMessage(message, 3);
    let type = split[0];
    let messageId = split[1];
    let args = destringifyArgs(split[2]);
    onReceiveMessage(socket, db, type, messageId, args);
  } catch (err) {
    log('invalid message, ignoring', err);
  }
}

function onReceiveBinaryMessage(message, socket, db) {
  try {
    let headerLen = parseInt(message.slice(0, 16).toString('utf8'), 10);
    let header = JSON.parse(message.slice(16, 16 + headerLen).toString('utf8'));
    let body = message.slice(16 + headerLen);
    header.args[header.blobIndex] = body;
    onReceiveMessage(socket, db, header.messageType, header.messageId, header.args);
  } catch (err) {
    log('invalid message, ignoring', err);
  }
}

function listen(options = {}) {
  let server = options.server ? (socketIO(options.server)) : (socketIO());
  if (!options.server) {
    server.listen(options.port, options.socketOptions || {});
  }


  server.on('connection', function(socket) {
    const pouchdb = require('pouchdb');
    const onMessage = options.onConnection(socket, pouchdb);

    socket.on('message', function (message) {
      const db = onMessage(message);
      const messageWithoutDb = message.split(':').slice(1).join(':');
      if (typeof messageWithoutDb !== 'string') {
        return onReceiveBinaryMessage(messageWithoutDb, socket, db);
      }
      onReceiveTextMessage(messageWithoutDb, socket, db);
    });
    socket.on('close', function () {
      log('closing socket', socket.id);
      socket.removeAllListeners();
    });
    socket.on('error', function (err) {
      log('socket threw an error', err);
      socket.removeAllListeners();
    });
  });

  return server;
}

module.exports = {
  listen: listen
};
