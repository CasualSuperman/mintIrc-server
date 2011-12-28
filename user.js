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

// Checks the populated email list for user existence
var isUser = function(email) {
	email = email.toLowerCase();
	email = lib.crypto.createHash('md5').update(email).digest('hex');
	return registered.indexOf(email) !== -1;
}

var getUserSync = function(email) {
	email = email.toLowerCase();
	email = lib.crypto.createHash('md5').update(email).digest('hex');
	var data = info[email];
	if (data) {
		return data;
	} else {
		var file = lib.path.join(dir, email);
		if (lib.path.existsSync(file)) {
			info[email] = JSON.parse(lib.fs.readFileSync(file));
			info[email].exists = true;
			return info[email];
		} else {
			return {exists: false};
		}
	}
}

var getUser = function(email, callback) {
	email = email.toLowerCase();
	email = lib.crypto.createHash('md5').update(email).digest('hex');
	var data = info[email];
	if (data) {
		callback(data);
	} else {
		var file = lib.path.join(dir, email);
		lib.path.exists(file, function(exists) {
			if (exists) {
				info[email] = JSON.parse(lib.fs.readFileSync(file));
				info[email].exists = true;
				callback(info[email]);
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
	var email = user.email.toLowerCase();
	email = lib.crypto.createHash('md5').update(email).digest('hex');
	var file = lib.path.join(dir, email);
	if (isRegistered(email) || lib.path.existsSync(file)) {
		// path.exists should never happen, but just to be safe..
		return false;
	}
	var base = defaults();
	base.email = user.email;
	base.username = user.username;
	base.modified = true;
	info[email] = base;
	registered.push(email);
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
