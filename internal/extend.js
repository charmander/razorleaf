"use strict";

const extend = (dest, src) => {
	for (const x of src) {
		dest.push(x);
	}
};

module.exports = extend;
