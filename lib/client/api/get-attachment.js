module.exports = function(adapterFun, sendMessage) {
	return adapterFun('getAttachment', function(docId, attachmentId, opts, callback) {
		if (typeof opts === 'function') {
			callback = opts;
			opts = {};
		}
		sendMessage('getAttachment', [docId, attachmentId, opts], callback);
	});
}