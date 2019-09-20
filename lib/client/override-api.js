'use strict';
var clientUtils = require('./utils');
var adapterFun = clientUtils.adapterFun;
var getId = require('./api/get-id');
var getSocketName = require('./api/get-socket-name');
var getType = require('./api/get-type');
var compact = require('./api/compact');
var info = require('./api/info');
var get = require('./api/get');
var _get = require('./api/_get');
var remove = require('./api/remove');
var getAttachment = require('./api/get-attachment');
var removeAttachment = require('./api/remove-attachment');
var putAttachment = require('./api/put-attachment');
var put = require('./api/put');
var post = require('./api/post');
var _bulkDocs = require('./api/_bulkDocs');
var _allDocs = require('./api/_allDocs');
var _changes = require('./api/_changes');
var revsDiff = require('./api/revsDiff');
var _query = require('./api/_query');
var _viewCleanup = require('./api/_viewCleanup');

module.exports = function(api, callback, sendMessage, sendBinaryMessage) {
	api._socketName = getSocketName(api, opts);
	api.type = getType;
	api._id = getId(adapterFun, sendMessage);
	api.compact = compact(adapterFun, sendMessage);
	api._info = info.bind(null, sendMessage);
	api.get = get(adapterFun, sendMessage);
	api._get = _get(api.get);
	api.remove = remove(adapterFun, sendMessage);
	api.getAttachment = getAttachment(adapterFun, sendMessage);
	api.removeAttachment = removeAttachment(adapterFun, sendMessage);
	api.putAttachment = putAttachment(adapterFun, sendBinaryMessage);
	api.put = put(adapterFun, sendMessage);
	api.post = post(adapterFun, sendMessage);
	api._bulkDocs = _bulkDocs(sendMessage);
	api._allDocs = _allDocs(sendMessage);
	api._changes = _changes(sendMessage, api, callback);
	api.revsDiff = revsDiff(adapterFun, sendMessage);
	api._query = _query(adapterFun, sendMessage);
	api._viewCleanup = _viewCleanup(adapterFun, sendMessage);
	api._close = function(callback) {
		api._closed = true;
		var cacheKey = '$' + api._socketName;
		if (!instances[cacheKey]) { // already closed/destroyed
			return callback();
		}
		delete instances[cacheKey];
		close(api, callback);
	};
	api.destroy = adapterFun('destroy', function(opts, callback) {
		if (typeof opts === 'function') {
			callback = opts;
			opts = {};
		}
		var cacheKey = '$' + api._socketName;

		if (!instances[cacheKey]) { // already closed/destroyed
			return callback(null, { ok: true });
		}
		delete instances[cacheKey];
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
}