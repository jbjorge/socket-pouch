module.exports = function(adapterFun, sendMessage) {
	return adapterFun('viewCleanup', function(callback) {
		sendMessage('viewCleanup', [], callback);
	});
}