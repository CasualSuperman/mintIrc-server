// Setup: lib loading, etc.
var lib = {
	io  : require('socket.io').listen(33111),
	irc : require('irc'),
	user: require('./user')('users'),
};

// All online users are stored here for session-sharing.
var onlineUsers = {};

lib.io.of("/mintI").on('connection', function(socket) {
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
			var user = socket.get('user');
			if (user) {
				user.disconnect(socket);		
			}
		},
		guest: function() {
			socket.set('user', new OnlineUser());
			console.log("Guest logged in.");
		},
		register: function(info) {
			console.log("Registering: " + info);
		},
	};
	for (var event in events) {
		console.info("Adding event handler /mintI/" + event);
		socket.on(event, events[event]);
	}
	socket.on('disconnect', function() {
		console.log("LEAVING.");
		var user = socket.get('user', function(err, name) {
			if (!err && user) {
				onlineUsers[user].disconnect(socket);
			} else {
				console.log(err);
			}
		});
	});
});

lib.io.of("/irc").on('connection', function(socket) {
	var events = {
		say: function(info) {
			socket.get('nick', function(err, nick) {
				if (!err) {
					var user = onlineUsers[nick];
					var conn = user.getServer(info.addr);
					if (conn) {
						conn.say(info.chan, info.msg);
						info.nick = nick;
						user.broadcast('message', info);
					}
				}
			});
		},
		join: function(info) {
			socket.get('nick', function(err, nick) {
				if (!err) {
					var conn = onlineUsers[nick].getServer(info.addr);
					if (conn) {
						try {
							conn.join(info.chan);
						} catch (err) {
							console.log(err);
						}
					}
				}
			});
		},
		raw: function(info) {
			socket.get('nick', function(err, nick) {
				if (!err) {
					var conn = onlineUsers[nick].getServer(info.addr);
					conn.send(info.msg);
				}
			});
		},
		connect: function(info) {
			socket.get('nick', function(err, nick) {
				if (!err) {
					onlineUsers[nick].joinServer(info);
				}
			});
		},
		nick: function(nick) {
			console.log("Setting nick to " + nick);
			socket.get('nick', function(err, oldNick) {
				if (!err) {
					socket.set('nick', nick, function() {
						onlineUsers[nick] = onlineUsers[oldNick];
						onlineUsers[oldNick] = null;
						console.log("Nick set to " + nick);
					});
				}
			});
		},
		disconnect: function() {
			socket.get('nick', function(err, nick) {
				if (!err) {
					onlineUsers[nick].disconnect(socket);
				}
			});
		},
		quit: function() {
			socket.get('nick', function(err, nick) {
				if (!err) {
					onlineUsers[nick].disconnect(socket);
				}
			});
		},
	};
	for (var event in events) {
		console.info("Adding event handler /irc/" + event);
		socket.on(event, events[event]);
	}
	var nick = genRandomNick();
	socket.set('nick', nick, function() {
		onlineUsers[nick] = new OnlineUser(null, {
				nick: nick,
		});
		console.log("Picked random nick " + nick);
		onlineUsers[nick].conns.web.push(socket);
		onlineUsers[nick].nick = nick;
	});
});

var genRandomNick = (function() {
	var prefixes  = ['Minty', 'Casual'];
	var names     = ['Spring', 'Superman'];
	var postfixes = ['Fresh', 'Noodles'];

	function random(arr) {
		var index = Math.floor(Math.random() * arr.length);
		return arr[index];
	}

	return function() {
		var name = random(names);
		while (Math.random() < 0.15) {
			name = random(prefixes) + name;
		}
		while (Math.random() < 0.05) {
			name += random(postfixes);
		}
		return name;
	};
})();

var OnlineUser = function(auth, local) {
	this.info = local;
	this.nick = "";
	this.conns = {
		irc: {}, // irc[addr] = conn
		web: [], // loop
	};
	this.getServer = function(addr) {
		var irc = this.conns.irc[addr];
		return irc;
	};
	this.broadcast = function(type, msg) {
		this.conns.web.forEach(function(conn) {
			conn.emit(type, msg);
		});
	};
	this.joinServer = function(info) {
		var addr = info.addr;
		if (!this.conns.irc[addr]) {
			var conn = new lib.irc.Client(addr, this.nick, {
				userName: 'mintIrc',
				realName: 'mintIrc web client',
				channels: info.chans || [],
			});
			this.conns.irc[addr] = conn;
			var user = this;
			var events = {
				join: function (channel, nick, message) {
					user.broadcast('join', {
						chan: channel,
						nick: nick,
						addr: addr,
					});
				},
				part: function (channel, nick, reason, message) {
					user.broadcast('part', {
						chan: channel,
						nick: nick,
						reason: reason,
						addr: addr,
					});
				},
				quit: function (nick, reason, chans, message) {
					user.broadcast('quit', {
						nick: nick,
						msg: reason,
						chans: chans,
						addr: addr,
					});
				},
				names: function (channel, nicks) {
					user.broadcast('names', {
						chan: channel,
						names: nicks,
						addr: addr,
					});
				},
				registered: function (message) {
					user.broadcast('registered', {
						msg: message,
						addr: addr,
						nick: user.nick,
					});
				},
				topic: function (channel, topic, nick, message) {
					user.broadcast('topic', {
						chan: channel,
						topic: topic,
						nick: nick,
						addr: addr,
					});
				},
				nick: function (oldNick, newNick, chans, message) {
					user.broadcast('nick', {
						nick: oldNick,
						msg: newNick,
						chans: chans,
						addr: addr,
					});
				},
				message: function (nick, to, text) {
					switch (to[0]) {
					case '#':
					case '&':
						user.broadcast('message', {
							chan: to,
							nick: nick,
							msg: text,
							addr: addr,
						});
						break;
					default:
						user.broadcast('pm', {
							nick: nick,
							msg: text,
							addr: addr,
						});
					}
				},
			};
			for (event in events) {
				conn.addListener(event, events[event]);
			}
		}
	};
	this.disconnect = function(sock) {
		var index = this.conns.web.indexOf(sock);
		if (index >= 0) {
			this.conns.web.splice(index, 1);
		}
		if (this.conns.web.length === 0) {
			if (!this.persist) {
				for (addr in this.conns.irc) {
					this.conns.irc[addr].disconnect("mintIrc (http://mintIrc.com/)");
				}
			}
		}
	};
};
