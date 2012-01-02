var lib = {
	crypto: require('crypto'),
};

// Caches no results
var noCache = function(data) {
	return lib.crypto.createHash('sha1').update(data).digest('hex');
};
// Caches some results
var allCache = (function() {
	// Cache of hashed emails in a local scope.
	var hashCache = {};
	return function sha1(data) {
		var hash = hashCache[data];
		if (hash) {
			return hash;
		}
		return hashCache[data] = noCache(data);
	};
}());
// Caches a client-supplied number of results
var someCache = function makeSomeHash(count) {
	var hashCache = {
		last: [],
	};
	var shrinkToSize = function() {
		while (hashCache.last.length > count) {
			delete hashCache[hashCache.last.shift()];
		}
	};
	return function sha1(data) {
		var hash = hashCache[data];
		if (hash) {
			return hash;
		}
		hashCache[data] = hash = noCache(data);
		hashCache.last.push(data);
		shrinkToSize();
		return hash;
	};
};

module.exports = function sha1_init(cacheSize) {
	switch(cacheSize) {
		case 0:
			return noCache;
		case -1:
			return allCache;
		default:
			return someCache(cacheSize);
	}
};
