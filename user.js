var lib = {
	fs  : require('fs'),
	path: require('path'),
};

var registered = [];
var info = {};
var dir = null;

// Read users in from file.
var isUser = function(username) {
	username = username.toLowerCase();
	return registered.indexOf(username) !== -1;
}

var getUserSync = function(username) {
	username = username.toLowerCase();
	var data = info[username];
	if (data) {
		return data;
	} else {
		var file = lib.path.join(dir, username);
		if (lib.path.existsSync(file)) {
			info[username] = JSON.parse(lib.fs.readFileSync(file));
			info[username].exists = true;
			return info[username];
		} else {
			return {exists: false};
		}
	}
}

var getUser = function(username, callback) {
	username = username.toLowerCase();
	var data = info[username];
	if (data) {
		callback(data);
	} else {
		var file = lib.path.join(dir, username);
		lib.path.exists(file, function(exists) {
			if (exists) {
				info[username] = JSON.parse(lib.fs.readFileSync(file));
				info[username].exists = true;
				callback(info[username]);
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
	var username = user.username.toLowerCase();
	var file = lib.path.join(dir, username);
	if (isRegistered(username) || lib.path.existsSync(file)) {
		// path.exists should never happen, but just to be safe..
		return false;
	}
	var base = defaults();
	base.email = user.email;
	base.username = user.username;
	base.modified = true;
	info[username] = base;
	registered.push(username);
	return true;
};

var syncDisk = function() {
	info.forEach(function(user) {
		if (user.modified) {
			delete user.modified;
			lib.fs.writeFile(file, JSON.stringify(user));
		}
	});
};

var verify = function(user, auth, call) {
	var answer = lib.https.request({
		host: 'browserid.org',
		path: '/verify?assertion=' + auth + '&audience=https://mintirc.com/',
		method: 'POST',
	}, function verify(ans) {
		ans.on('data', function(d) {
			var result = JSON.parse(d);
			result.username = user;
			call(result);
		});
	});
};

exports = module.exports = function(_dir) {
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
