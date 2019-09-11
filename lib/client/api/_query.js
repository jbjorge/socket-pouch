var clientUtils = require('../utils');
var readAttachmentsAsBlobOrBuffer = clientUtils.readAttachmentsAsBlobOrBuffer;

module.exports = function(adapterFun, sendMessage) {
	return adapterFun('query', function(fun, opts, callback) {
		if (typeof opts === 'function') {
			callback = opts;
			opts = {};
		}
		var funEncoded = fun;
		if (typeof fun === 'function') {
			funEncoded = { map: fun };
		}
		sendMessage('query', [funEncoded, opts], function(err, res) {
			if (err) {
				return callback(err);
			}
			if (opts.attachments && opts.binary) {
				res.rows.forEach(readAttachmentsAsBlobOrBuffer);
			}
			callback(null, res);
		});
	});
}