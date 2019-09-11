module.exports = function(api, opts) {
	return api.name || opts.originalName;
};
