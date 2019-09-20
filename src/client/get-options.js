var utils = require('../shared/utils');

module.exports = function(options) {
	if (typeof options === 'string') {
		var slashIdx = utils.lastIndexOf(options, '/');
		return {
			url: options.substring(0, slashIdx),
			name: options.substring(slashIdx + 1)
		};
	}
	return utils.clone(options);
}