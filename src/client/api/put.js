import utils from '../../shared/utils';
import errors from '../../shared/errors';
import { preprocessAttachments } from '../utils';

export default function(adapterFun, sendMessage) {
	return adapterFun('put', utils.getArguments(function(args) {
		let temp, temptype, opts;
		let doc = args.shift();
		let id = '_id' in doc;
		let callback = args.pop();
		if (typeof doc !== 'object' || Array.isArray(doc)) {
			return callback(errors.error(errors.NOT_AN_OBJECT));
		}

		doc = utils.clone(doc);

		preprocessAttachments(doc).then(function() {
			while (args.length) {
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
			}
			opts = opts || {};

			sendMessage('put', [doc, opts], callback);
		}).catch(callback);

	}));
}