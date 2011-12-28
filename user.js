var lib = {
	fs    : require('fs'),
	path  : require('path'),
	crypto: require('crypto'),
};

// Holds a list of hashed emails
var registered = [];
// Holds cached user information, indexed by hashed email.
var info = {};
// Cache of hashed emails. Cause hashing is relatively slow.
var hashCache = {};
// The directory to check for users in.
var dir = null;

var md5 = function(data) {
	data = data.toLowerCase();
	if (hashCache[data]) {
		return hashCache[data];
	}
	return hashCache[data] = lib.crypto.createHash('md5').update(data).digest('hex');
}

// Checks the populated email list for user existence
var isUser = function(email) {
	return registered.indexOf(md5(email)) !== -1;
}

var getUserSync = function(email) {
	var hash = md5(email);
	var data = info[hash];
	if (data) {
		return data;
	} else {
		var file = lib.path.join(dir, hash);
		if (lib.path.existsSync(file)) {
			info[hash] = JSON.parse(lib.fs.readFileSync(file));
			info[hash].exists = true;
			return info[hash];
		} else {
			return {exists: false};
		}
	}
}

var getUser = function(email, callback) {
	var hash = md5(email);
	var data = info[hash];
	if (data) {
		callback(data);
	} else {
		var file = lib.path.join(dir, hash);
		lib.path.exists(file, function(exists) {
			if (exists) {
				info[hash] = JSON.parse(lib.fs.readFileSync(file));
				info[hash].exists = true;
				callback(info[hash]);
			} else {
				callback({exists: false});
			}
		});
	}
}

var defaults = (function() {
	var init = {
		userLevel: 0,
	};
	var templ = JSON.stringify(init);
	return function clone() {
		return JSON.parse(templ);
	}
}());
	
var makeUser = function(user){
	var hash = md5(user.email);
	var file = lib.path.join(dir, hash);
	if (isRegistered(user.email) || lib.path.existsSync(file)) {
		// path.exists should never happen, but just to be safe..
		return false;
	}
	var base = defaults();
	base.email = user.email;
	base.username = user.username;
	base.modified = true;
	info[hash] = base;
	registered.push(user.email);
	return true;
};

var syncDisk = function() {
	info.forEach(function(user) {
		if (user.modified) {
			delete user.modified;
			// TODO: Finish this
			lib.fs.writeFile(file, JSON.stringify(user));
		}
	});
};

var verify = function(username, auth, call) {
	var answer = lib.https.request({
		host: 'browserid.org',
		path: '/verify?assertion=' + auth.hash + '&audience=' auth.addr,
		method: 'POST',
	}, function verify(ans) {
		ans.on('data', function(d) {
			var result = JSON.parse(d);
			result.username = username;
			call(result);
		});
	});
};

exports = module.exports = function(_dir) {
	// Read users in from file.
	dir = _dir;
	if (!lib.path.existsSync(_dir)) {
		lib.fs.mkdirSync(_dir, 0755);
	} else {
		// Get a list of users.
		var isFile = function(elem) {
			var path = lib.path.join(_dir, elem);
			return lib.fs.statSync(path).isFile();
		};
		registered = lib.fs.readdirSync(_dir).filter(isFile);
	}
	this.isUser = isUser;
	this.getUser = getUser;
	this.getUserSync = getUserSync;
	this.makeUser = makeUser;
	this.sync = syncDisk;
	this.verify = verify;
}
