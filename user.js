var lib = {
	fs  : require('fs'),
	path: require('path'),
	sha1: require('./sha1')(100),
};

// Holds a list of hashed emails
var registered = [];
// Holds cached user information, indexed by hashed email.
var info = {};
// The directory to check for users in.
var dir = null;
// Local.
var sha1 = lib.sha1;

// Checks the populated email list for user existence
var isUser = function(email) {
	return registered.indexOf(sha1(email)) !== -1;
}

// Gets user info synchronously.
var getUserSync = function(email) {
	var hash = sha1(email);
	var data = info[hash];
	// If it's in the cache, return it.
	if (data) {
		return data;
	} else {
		// Otherwise, load it from the file.
		var file = lib.path.join(dir, hash);
		if (lib.path.existsSync(file)) {
			info[hash] = JSON.parse(lib.fs.readFileSync(file));
			info[hash].exists = true;
			return info[hash];
		} else {
			// No such user.
			return {exists: false};
		}
	}
}

// Gets user info asynchronously. See getUserSync
var getUser = function(email, callback) {
	var hash = sha1(email);
	var data = info[hash];
	if (data) {
		callback(data);
	} else {
		var file = lib.path.join(dir, hash);
		lib.path.exists(file, function(exists) {
			if (exists) {
				info[hash] = JSON.parse(lib.fs.readFileSync(file));
				callback(info[hash]);
			} else {
				callback({exists: false});
			}
		});
	}
}

// A helper function with default user properties
var defaults = (function() {
	var init = {
		userLevel: 0,
		autorun: {
			encrypted: false,
			payload: JSON.stringify({}),
		},
		exists: true,
	};
	var templ = JSON.stringify(init);
	return function clone() {
		return JSON.parse(templ);
	}
}());

// Creates a user. Takes a mysterious "user object".
var makeUser = function(user){
	var hash = sha1(user.email);
	var file = lib.path.join(dir, hash);
	if (isUser(hash) || lib.path.existsSync(file)) {
		// path.exists should never happen, but just to be safe..
		return false;
	}
	var base = defaults();
	base.email = user.email;
	base.username = user.username;
	base.modified = true;
	info[hash] = base;
	registered.push(hash);
	return true;
};

// Syncs all modified users to disk.
var syncDisk = function() {
	info.forEach(function(user) {
		if (user.modified) {
			delete user.modified;
			var file = lib.path.join(dir, sha1(user.email));
			lib.fs.writeFile(file, JSON.stringify(user));
		}
	});
};

// Verifies a browserid auth token.
var verify = function(auth, call) {
	var answer = lib.https.request({
		host: 'browserid.org',
		path: ('/verify?assertion=' + auth.hash + '&audience=' + auth.addr),
		method: 'POST',
	}, function verify(ans) {
		ans.on('data', function(d) {
			var result = JSON.parse(d);
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
	var ret = {};
	ret.isUser = isUser;
	ret.getUser = getUser;
	ret.getUserSync = getUserSync;
	ret.makeUser = makeUser;
	ret.sync = syncDisk;
	ret.verify = verify;
	return ret;
}
