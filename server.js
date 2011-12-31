var lib = {};
// Setup: lib loading, etc.
var setup = (function() {
	lib = {
		app : require('http').createServer(handle),
		fs  : require('fs'),
		net : require('net'),
		url : require('url'),
		mime: require('mime'),
		path: require('path'),
		irc : require('irc'),
		user: require('./user')('users'),
	};
	lib.app.listen(80);
	
	lib.io = require('socket.io').listen(lib.app);
	lib.io.set('log level', 1);
});

// Simple file handling.
var handle = (function() {
	var serve = function(res, filename) {	
		lib.fs.readFile(filename,
			function sendFile(err, data) {
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
	};
	return function handler(req, res) {
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
}());
// Start serving http.
setup();

// All online users are stored here for session-sharing.
var onlineUsers = {};

lib.io.sockets.on('connection', function(socket) {
	var events = {
		login: function(auth) {
			lib.user.verify(auth, function login(user) {
				if (user.status !== "okay") {
					socket.emit('login_failed', user);
					return;
				}
				if (lib.user.isUser(user.email)) {
					var localUser = lib.user.getUserSync(user.email);
					var online = onlineUsers[user.email];
					if (online) {
						socket.set('user', online);
					} else {
						online = onlineUsers[user.email] = new OnlineUser(auth, localUser);
					}
					online.addWebConn(socket);
					socket.emit('login_passed', localUser);
				} else {
					socket.emit('register', user);
				}
			});
		},
		logout: function() {
	
		},
		guest: function() {
	
		},
		register: function(info) {
	
		},
		disconnect: function() {
			var user = socket.get('user');
			if (user) {
				user.disconnect(socket);
			}
		},
	};
	for (var event in events) {
		if (events.hasOwnProperty(event)) {
			socket.on(event, events[event]);
		}
	}
	socket.on("login", function login(auth) {
		lib.user.verify(auth, function changeUser(response) {
			if (response.status === "okay") {
				var user = onlineUsers[info.email];
				if (!user) {
					user = new OnlineUser(info.user);
					user.conns = oldUser.conns;
					socket.emit('login_passed', response);
				}
				user = newUser;
			} else {
				socket.emit('login_failed');
			}
		});
	});
	socket.on('message', function(msg) {
		client.send(msg);
	});
});

var OnlineUser = function(auth, local) {
	this.info = local;
	this.conns = {
		irc: {}, // irc[addr] = conn
		web: [], // loop
	};
};

OnlineUser.prototype = {
	broadcast: function(msg) {
		this.conns.web.forEach(function(conn) {
			conn.emit('message', msg);
		});
	},
	joinServer: function(addr) {
		if (!this.conns.irc[addr]) {
			var conn = new lib.irc.Client(addr, this.nick, {userName: 'mintIrc'});
			this.conns.irc[addr] = conn;
			conn.addListener('raw', function(message) {
				this.broadcast({addr: addr, msg: message.rawCommand});
			});
		}
	},
	disconnect: function(sock) {
		var index = this.conns.web.indexOf(sock);
		if (index >= 0) {
			this.conns.web.splice(index, 1);
		}
		if (this.conns.web.length === 0) {
			if (!this.persist) {
				this.conns.irc.forEach(function(client) {
					client.disconnect("mintIrc (http://mintIrc.com/)");
				});
			}
		}
	},
};
