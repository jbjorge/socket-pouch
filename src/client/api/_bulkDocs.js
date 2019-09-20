'use strict';
import Promise from 'pouchdb-promise';
import isBinaryObject from '../../shared/isBinaryObject';
import readAsBinaryString from '../readAsBinaryString';
import base64 from '../base64';

export default function(sendMessage) {
	return function(req, opts, callback) {
		let docs = req.docs || req;

		Promise.all(docs.map(function(doc) {
			let atts = doc._attachments;
			if (!atts) {
				return;
			}
			return Promise.all(Object.keys(atts).map(function(key) {
				let att = doc._attachments[key];
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
