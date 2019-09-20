export default function(adapterFun, sendMessage) {
	return adapterFun('id', function(callback) {
		sendMessage('id', [], callback);
	});
}