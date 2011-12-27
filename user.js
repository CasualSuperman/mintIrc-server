var lib = {
	fs  : require('fs'),
	path: require('path'),
};
var registered = [];
var info = {};

// Read users in from file.
var dir = "users";
if (!lib.path.existsSync(dir)) {
	lib.fs.mkdirSync(dir, 0755);
} else {
	// Get a list of users.
	var isFile = function(elem) {
		var path = lib.path.join(dir, elem);
		return lib.fs.statSync(path).isFile();
	};
	registered = lib.fs.readdirSync(dir).filter(isFile);
}

exports.isUser = function(username) {
	username = username.toLowerCase();
	return registered.indexOf(username) !== -1;
}

exports.getUserSync = function(username) {
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

exports.getUser = function(username, callback) {
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
	
exports.makeUser = function(user){
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

exports.syncDisk = function() {
	info.forEach(function(user) {
		if (user.modified) {
			delete user.modified;
			lib.fs.writeFile(file, JSON.stringify(user));
		}
	});
};

exports.verify = function(user, auth, call) {
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
