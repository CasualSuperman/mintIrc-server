// Libraries
var lib = {
	crypto: require('crypto'),
};

// our Configuration
var config = {
	cache: -1,
};

// The Cache
var hashCache = {
	last: [],
};
var shrinkToSize = function() {
	while (hashCache.last.length > config.cache) {
		delete hashCache[hashCache.last.shift()];
	}
};

// Caches no results
var noCache = function(data) {
	return lib.crypto.createHash('sha1').update(data).digest('hex');
};

// Caches some results
var allCache = function(data) {
	var hash = hashCache[data];
	if (hash) {
		return hash;
	}
	return hashCache[data] = noCache(data);
};

// Caches a client-supplied number of results
var someCache = function(data) {
	var hash = hashCache[data];
	if (hash) {
		return hash;
	}
	hashCache[data] = hash = noCache(data);
	hashCache.last.push(data);
	shrinkToSize();
	return hash;
};

module.exports = function sha1(data) {
	switch(config.cache) {
		case 0:
			return noCache;
		case -1:
		case undefined:
			return allCache;
		default:
			config.cache = data;
			return someCache; //(cacheSize);
	}
};
