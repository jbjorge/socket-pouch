'use strict';
import utils from '../../shared/utils';
import uuid from '../../shared/uuid';
import { readAttachmentsAsBlobOrBuffer } from '../utils';

export default function(sendMessage, api, callback) {
	return function(opts) {
		opts = utils.clone(opts);

		if (opts.continuous) {
			let messageId = uuid();
			api._changesListeners[messageId] = {
				listener: opts.onChange,
				asBinary: opts.attachments && opts.binary
			};
			api._callbacks[messageId] = opts.complete;
			api._socket.send('liveChanges' + ':' + messageId + ':' + JSON.stringify([opts]));
			return {
				cancel: function() {
					api._socket.send('cancelChanges' + ':' + messageId + ':' + JSON.stringify([]));
				}
			};
		}

		sendMessage('changes', [opts], function(err, res) {
			if (err) {
				opts.complete(err);
				return callback(err);
			}
			res.results.forEach(function(change) {
				if (opts.attachments && opts.binary) {
					readAttachmentsAsBlobOrBuffer(change);
				}
				opts.onChange(change);
			});
			if (opts.returnDocs === false || opts.return_docs === false) {
				res.results = [];
			}
			opts.complete(null, res);
		});
	};
}
