import utils from '../../shared/utils';

export default function(adapterFun, sendMessage) {
	return adapterFun('post', function(doc, opts, callback) {
		if (typeof opts === 'function') {
			callback = opts;
			opts = {};
		}
		opts = utils.clone(opts);

		sendMessage('post', [doc, opts], callback);
	});
}