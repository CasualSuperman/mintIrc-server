var crypto = require('crypto');
var cache = {};
var email = "robert.wertman@gmail.com";

var times = 100000;

console.log("Starting hash.");
for (var i = 0; i < times; ++i) {
	crypto.createHash('md5').update(email).digest('hex');
}
console.log("Hash done.");
function checkEmail(email) {
	email = email.toLowerCase();
	if (cache[email])
		return cache[email];
	return cache[email] = crypto.createHash('md5').update(email).digest('hex');
}
console.log("Starting cache.");
for (var i = 0; i < times; ++i) {
	checkEmail(email);
}
console.log("Cache done.");
