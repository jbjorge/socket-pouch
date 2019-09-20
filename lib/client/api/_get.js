'use strict';
export default function(getFunc) {
	// hacky code necessary due to implicit breaking change in
	// https://github.com/pouchdb/pouchdb/commits/0ddeae6b
	return function(id, opts, callback) {
		getFunc(id, opts, function(err, doc) {
			if (err) {
				return callback(err);
			}
			callback(null, { doc: doc });
		});
	};
}