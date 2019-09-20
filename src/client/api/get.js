import { readAttachmentsAsBlobOrBuffer } from '../utils';

export default function(adapterFun, sendMessage) {
	return adapterFun('get', function(id, opts, callback) {
		if (typeof opts === 'function') {
			callback = opts;
			opts = {};
		}
		sendMessage('get', [id, opts], function(err, res) {
			if (err) {
				return callback(err);
			}
			if (opts.attachments && opts.binary) {
				if (Array.isArray(res)) {
					res.forEach(readAttachmentsAsBlobOrBuffer);
				} else {
					readAttachmentsAsBlobOrBuffer({ doc: res });
				}
			}
			callback(null, res);
		});
	});
}