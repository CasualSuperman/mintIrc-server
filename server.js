// Libs go in here.
var lib = {};

// Setup: lib loading, etc.
(function setup() {
	lib = {
		io  : require('socket.io').listen(33111),
		irc : require('irc'),
		user: require('./user')('users'),
	};
	lib.io.set('log level', 1);
}());

// All online users are stored here for session-sharing.
var onlineUsers = {};

lib.io.sockets.on('connection', function(socket) {
	var events = {
		mintI: {
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
				var user = socket.get('user');
				if (user) {
					user.disconnect(socket);		
				}
			},
			guest: function() {
				socket.set('user', new OnlineUser());
			},
			register: function(info) {
			},
		},
		irc: {
			say: function(info) {
				var user = socket.get('user');
				if (user) {
					var conn = user.getServer(info.addr);
					if (conn) {
						conn.say(info.target, info.msg);
						user.broadcast(info);
					}
				}
			},
			connect: function(serv) {
				
			},
		},
	};
	(['mintI', 'irc']).forEach(function(namespace) {
		for (var event in events[namespace]) {
			socket.on(namespace + '-' + event, events[namespace][event]);
		}
	});
	socket.on('disconnect', function() {

		var user = socket.get('user');
		if (user) {
			user.disconnect(socket);
		}
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
	getServer: function(addr) {
		var irc = this.conns.irc[addr];
		return irc;
	},
	broadcast: function(type, msg) {
		this.conns.web.forEach(function(conn) {
			conn.emit(type, msg);
		});
	},
	joinServer: function(addr) {
		if (!this.conns.irc[addr]) {
			var conn = new lib.irc.Client(addr, this.nick, {userName: 'mintIrc'});
			this.conns.irc[addr] = conn;
			conn.addListener('raw', function(message) {
				this.broadcast('message',{addr: addr, msg: message.rawCommand});
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
