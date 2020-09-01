export default function(adapterFun, sendMessage) {
	return adapterFun('remove', function(docOrId, optsOrRev, opts, callback) {
		let doc;
		if (typeof optsOrRev === 'string') {
			// id, rev, opts, callback style
			doc = {
				_id: docOrId,
				_rev: optsOrRev
			};
			if (typeof opts === 'function') {
				callback = opts;
				opts = {};
			}
		} else {
			// doc, opts, callback style
			doc = docOrId;
			if (typeof optsOrRev === 'function') {
				callback = optsOrRev;
				opts = {};
			} else {
				callback = opts;
				opts = optsOrRev;
			}
		}
		let rev = (doc._rev || opts.rev);

		sendMessage('remove', [doc._id, rev], callback);
	});
}