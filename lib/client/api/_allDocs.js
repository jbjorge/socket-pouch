'use strict';
var clientUtils = require('../utils');
var readAttachmentsAsBlobOrBuffer = clientUtils.readAttachmentsAsBlobOrBuffer;

export default function(sendMessage) {
	return function(opts, callback) {
		if (typeof opts === 'function') {
			callback = opts;
			opts = {};
		}
		sendMessage('allDocs', [opts], function(err, res) {
			if (err) {
				return callback(err);
			}
			if (opts.attachments && opts.binary) {
				res.rows.forEach(readAttachmentsAsBlobOrBuffer);
			}
			callback(null, res);
		});
	};
}