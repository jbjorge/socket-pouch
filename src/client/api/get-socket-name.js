export default function(api, opts) {
	return api.name || opts.originalName;
}
