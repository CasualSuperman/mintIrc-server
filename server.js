// Setup: lib loading, etc.
var lib = {
	fs  : require('fs'),
	io  : require('socket.io').listen(33111),
	irc : require('irc'),
	user: require('./user')('users'),
};

var security = {
	key : lib.fs.readFileSync('mintirc.com.pem'),
	cert: lib.fs.readFileSync('mintirc.com.crt'),
};

// All online users are stored here for session-sharing.
var onlineUsers = [];

lib.io.of("/irc").on('connection', function(socket) {
	// Find the next open ID.
	var id = onlineUsers.length;
	for (var i = 0; i < id; i++) {
		if (onlineUsers[i] === undefined) {
			id = i;
		}
	}

	onlineUsers[id] = new OnlineUser(null, {});
	onlineUsers[id].conns.web.push(socket);

	var events = {
		say: function(info) {
			var user = onlineUsers[id];
			var conn = user.getServer(info.addr);
			if (conn) {
				var head = "PRIVMSG " + info.chan + " : ";
				var sent = false;
				var msg = info.msg;
				while (msg.length > 0) {
					var toSend = "";
					if (sent) {
						msg = "... " + msg;
					}
					toSend += msg;
					if ((toSend.length + head.length) > 410) {
						var end = 410 - (head.length + 4);
						toSend = msg.slice(0, end);
						var space = toSend.lastIndexOf(' ');
						msg = msg.slice(end);
						if (space > toSend.length - 10) {
							msg = toSend.slice(space) + msg;
							toSend = toSend.slice(0, space);
						}
						toSend += " ...";
						sent = true;
					} else {
						toSend = msg;
						msg = "";
					}
					conn.say(info.chan, toSend);
					info.msg = toSend;
					user.broadcast('message', info);
				}
			}
		},
		action: function(info) {
			var user = onlineUsers[id];
			var conn = user.getServer(info.addr);
			if (conn) {
				conn.action(info.chan, info.msg);
				info.nick = info.nick;
				info.action = true;
				user.broadcast('message', info);
			}
		},
		join: function(info) {
			var conn = onlineUsers[id].getServer(info.addr);
			if (conn) {
				try {
					conn.join(info.chan);
				} catch (err) {
					console.log(err);
				}
			}
		},
		connect: function(info) {
			onlineUsers[id].joinServer(info);
		},
		disconnect: function() {
			onlineUsers[id].disconnect(socket);
		},
		quit: function(info) {
			onlineUsers[id].disconnect(socket);
		},
	};
	for (var event in events) {
		socket.on(event, events[event]);
	}
});

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
			var conn = new lib.irc.Client(addr, info.nick, {
				userName: 'mintIrc',
				realName: 'mintIrc web client',
				channels: info.chans || [],
//				secure  : security,
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
						reason: reason,
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
						nick: info.nick,
					});
					console.log("Nick: ", info.nick);
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
			var id = onlineUsers.indexOf(this);
			delete onlineUsers[id];
		}
	};
};
