let utils = require('../shared/utils');

export default function(options) {
	if (typeof options === 'string') {
		let slashIdx = utils.lastIndexOf(options, '/');
		return {
			url: options.substring(0, slashIdx),
			name: options.substring(slashIdx + 1)
		};
	}
	return utils.clone(options);
}