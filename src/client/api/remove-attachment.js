'use strict';
export default function(adapterFun, sendMessage) {
	return adapterFun('removeAttachment', function(docId, attachmentId, rev, callback) {
		sendMessage('removeAttachment', [docId, attachmentId, rev], callback);
	});
}