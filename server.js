var lib = {
	app : require('http').createServer(handler),
	fs  : require('fs'),
	net : require('net'),
	url : require('url'),
	mime: require('mime'),
	path: require('path'),
	irc : require('irc'),
};
lib.app.listen(80);

lib.io = require('socket.io').listen(lib.app);
lib.io.set('log level', 1);
lib.io.configure(function() {
	lib.io.set('browser client minification', true);
	lib.io.set('browser client etag', true);
	lib.io.set('browser client gzip', true);
	//io.set('browser client handler', true);
});

var users = (function() {
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

	var isRegistered = function(username) {
		username = username.toLowerCase();
		return registered.indexOf(username) !== -1;
	}

	var getInfoSync = function(username) {
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

	var getInfo = function(username, callback) {
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

	var newInfo = function(user){
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

				lib.fs.writeFile(file, JSON.stringify());
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

	return {
		existsUser:  isRegistered,
		getUser:     getInfo,
		getUserSync: getInfoSync,
		makeUser:    newInfo,
	}
}());

function handler(req, res) {
	var uri = lib.url.parse(req.url).pathname;
	var filename = lib.path.join("ui", uri);

	lib.path.exists(filename, function(exists) {
		if (exists) {
			if (lib.fs.statSync(filename).isDirectory()) {
				filename += "index.html";
			}
			serve(res, filename);
		} else {
			res.writeHead(404);
			return res.end("404 - File not found");
		}
	});
}
function serve(res, filename) {	
	lib.fs.readFile(filename,
		function (err, data) {
			if (err) {
				console.log(err);
				res.writeHead(500);
				return res.end("500 - Internal Application Error");
			}
			var type = lib.mime.lookup(filename);
			res.writeHead(200, {'Content-Type' : type});
			res.end(data);
		}
	);
}

lib.io.sockets.on('connection', function(socket) {
	var client = new lib.irc.Client('irc.foonetic.net', 'mintI-fresh', {
		channels: ['#ufeff'],
	});
	client.addListener('raw', function(message) {
		socket.emit("message", message.rawCommand);
	});
	socket.on("message", function(msg) {
		client.send(msg);
	});
	socket.on('disconnect', function() {
		client.disconnect("mintIrc (http://mintIrc.com/)");
	});
});

