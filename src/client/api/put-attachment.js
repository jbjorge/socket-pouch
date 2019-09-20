'use strict';
var utils = require('../../shared/utils');
var errors = require('../../shared/errors');
var isBrowser = typeof process === 'undefined' || process.browser;
var BufferWrapper = require('../../shared/buffer');

// Add the attachment given by blob and its contentType property
// to the document with the given id, the revision given by rev, and
// add it to the database given by host.
export default function(adapterFun, sendBinaryMessage) {
	return adapterFun('putAttachment', function(docId, attachmentId, rev, blob, type, callback) {
		if (typeof type === 'function') {
			callback = type;
			type = blob;
			blob = rev;
			rev = null;
		}
		if (typeof type === 'undefined') {
			type = blob;
			blob = rev;
			rev = null;
		}

		if (typeof blob === 'string') {
			var binary;
			try {
				binary = utils.atob(blob);
			} catch (err) {
				// it's not base64-encoded, so throw error
				return callback(errors.error(errors.BAD_ARG, 'Attachments need to be base64 encoded'));
			}
			if (isBrowser) {
				blob = utils.createBlob([utils.binaryStringToArrayBuffer(binary)], { type: type });
			} else {
				blob = binary ? new BufferWrapper(binary, 'binary') : '';
			}
		}

		var args = [docId, attachmentId, rev, null, type];
		sendBinaryMessage('putAttachment', args, 3, blob, callback);
	});
}