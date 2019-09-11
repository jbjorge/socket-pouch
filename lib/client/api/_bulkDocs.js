var Promise = require('pouchdb-promise');
var isBinaryObject = require('../../shared/isBinaryObject');
var readAsBinaryString = require('../readAsBinaryString');
var base64 = require('../base64');

module.exports = function(sendMessage) {
	return function(req, opts, callback) {
		var docs = req.docs || req;

		Promise.all(docs.map(function(doc) {
			var atts = doc._attachments;
			if (!atts) {
				return;
			}
			return Promise.all(Object.keys(atts).map(function(key) {
				var att = doc._attachments[key];
				if (!isBinaryObject(att.data)) {
					return;
				}
				return new Promise(function(resolve) {
					readAsBinaryString(att.data, resolve);
				}).then(function(binString) {
					att.data = base64.btoa(binString);
				});
			}));
		})).then(function() {
			sendMessage('bulkDocs', [req, opts], callback);
		}).catch(callback);
	};
}