module.exports = function(adapterFun, sendMessage) {
	return adapterFun('id', function (callback) {
    	sendMessage('id', [], callback);
  	});
};