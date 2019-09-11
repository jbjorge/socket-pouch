module.exports = function(adapterFun, sendMessage) {
	return adapterFun('compact', function(opts, callback) {
		if (typeof opts === 'function') {
			callback = opts;
			opts = {};
		}
		sendMessage('compact', [opts], callback);
	});
}