'use strict';
// Given a set of document/revision IDs (given by req), tets the subset of
// those that do NOT correspond to revisions stored in the database.
// See http://wiki.apache.org/couchdb/HttpPostRevsDiff
export default function(adapterFun, sendMessage) {
	return adapterFun('revsDiff', function(req, opts, callback) {
		// If no options were given, set the callback to be the second parameter
		if (typeof opts === 'function') {
			callback = opts;
			opts = {};
		}

		sendMessage('revsDiff', [req, opts], callback);
	});
}