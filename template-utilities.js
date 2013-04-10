"use strict";

var amp = /&/g;
var quot = /"/g;
var lt = /</g;
var gt = />/g;

function escapeAttributeValue(value) {
	return ("" + value).replace(amp, "&amp;")
	                    .replace(quot, "&quot;");
}

function escapeContent(content) {
	return ("" + content).replace(amp, "&amp;")
	                      .replace(lt, "&lt;")
	                      .replace(gt, "&gt;");
}

module.exports.escapeAttributeValue = escapeAttributeValue;
module.exports.escapeContent = escapeContent;
