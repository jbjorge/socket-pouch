var utils = require('../../shared/utils');
var errors = require('../../shared/errors');
var clientUtils = require('./utils');
var preprocessAttachments = clientUtils.preprocessAttachments;

module.exports = function(adapterFun, sendMessage) {
	return adapterFun('put', utils.getArguments(function(args) {
		var temp, temptype, opts;
		var doc = args.shift();
		var id = '_id' in doc;
		var callback = args.pop();
		if (typeof doc !== 'object' || Array.isArray(doc)) {
			return callback(errors.error(errors.NOT_AN_OBJECT));
		}

		doc = utils.clone(doc);

		preprocessAttachments(doc).then(function() {
			while (true) {
				temp = args.shift();
				temptype = typeof temp;
				if (temptype === "string" && !id) {
					doc._id = temp;
					id = true;
				} else if (temptype === "string" && id && !('_rev' in doc)) {
					doc._rev = temp;
				} else if (temptype === "object") {
					opts = utils.clone(temp);
				}
				if (!args.length) {
					break;
				}
			}
			opts = opts || {};

			sendMessage('put', [doc, opts], callback);
		}).catch(callback);

	}));
}