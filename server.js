// Setup: lib loading, etc.
var lib = {
	fs  : require('fs'),
	io  : require('socket.io').listen(33111),
	irc : require('irc'),
	user: require('./user')('users'),
};

// Our security keys.
var security = {
	key : lib.fs.readFileSync('mintirc.com.pem'),
	cert: lib.fs.readFileSync('mintirc.com.crt'),
};

/*
 * All online users are stored here.  In the future, this will let us to find
 * users with already logged in sessions, allowing us to join their sessions
 * dynamically.
 */
var onlineUsers = [];

// Each new web connection goes through here.
lib.io.of("/irc").on('connection', function(socket) {

	/*
	 * Start at the last index of onlineUsers, which is valid to assign to.  If
	 * there's an open slot, jump up to that instead. This avoids indefinitely
	 * extending the array.
	 */
	var id = onlineUsers.length;
	for (var i = 0; i < id; i++) {
		if (onlineUsers[i] === undefined) {
			id = i;
		}
	}

	// Put a new user into the open slot and add our web connection to it.
	onlineUsers[id] = new OnlineUser(null, {});
	onlineUsers[id].conns.web.push(socket);

	/*
	 * Store our id locally. We don't use it, but I have a feeling it will be
	 * useful in the future when implementing session joining.
	 */
	socket.set('id', id);

	// A list of events to handle.
	var events = {

		// When the user says something.
		say: function(info) {
			var user = onlineUsers[id];
			var conn = user.getServer(info.addr);

			// Make sure the connection we're writing to is found.
			if (conn) {
				// Split messages that are too long.
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

		// When the user performs an action (/me).
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

		// When the user joins a channel.
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

		// When the user connects to a server.
		connect: function(info) {
			onlineUsers[id].joinServer(info);
		},

		// When the user explicitly quits.
		quit: function(info) {
			onlineUsers[id].disconnect(socket);
		},

		// When the user requests a nick change.
		nick: function(info) {
			onlineUsers[id].getServer(info.addr).send("nick", info.nick);
		},

		// When the socket is disconnected.
		disconnect: function() {
			onlineUsers[id].disconnect(socket);
		},
	};

	// Loop through all our events, attach them to our socket.
	for (var event in events) {
		socket.on(event, events[event]);
	}
});

/*
 * Represents an online user.
 *
 * Auth is a token received from browserid. (TODO: Not currently implemented.)
 * local is the persistent representation of our user from our store.
 * 		(Also not implemented.)
 */
var OnlineUser = function(auth, local) {
	this.info = local;
	this.conns = {
		irc: {}, // irc[addr] = conn
		web: [], // loop
	};

	// Gets a server based on its address.
	this.getServer = function(addr) {
		var irc = this.conns.irc[addr];
		return irc;
	};

	// Send a message to each web connection under the heading "type".
	this.broadcast = function(type, msg) {
		this.conns.web.forEach(function(conn) {
			conn.emit(type, msg);
		});
	};

	// Joins the given server if it is not already connected.
	this.joinServer = function(info) {
		var addr = info.addr;
		if (!this.conns.irc[addr]) {
			var conn = new lib.irc.Client(addr, info.nick, {
				userName: 'mintIrc',
				realName: 'mintIrc web client',
				channels: info.chans || [],
//				secure  : security,
//				selfSigned: true,
			});
			this.conns.irc[addr] = conn;
			var user = this;

			// A list of events to handle from the irc connection.
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
						oldNick: oldNick,
						nick: newNick,
						chans: chans,
						addr: addr,
					});
				},
				/*
				 * This is necessary because the version of the library
				 * available from npm doesn't properly implement the 'message#'
				 * event, so we do our own type checking.
				 */
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
						break;
					}
				},
			};

			// Attach all the events.
			for (event in events) {
				conn.addListener(event, events[event]);
			}
		}
	};

	/*
	 * Disconnects a web socket. If there are no more listening sockets, and we
	 * aren't set to persist after all web connections are gone, disconnect all
	 * our irc connections and free our spot in the onlineUsers list.
	 */
	this.disconnect = function(sock) {
		// Filter out the socket.
		this.conns.web = this.conns.web.filter(function(conn) {
			return conn !== sock;
		});

		// If it's empty, shut it all down.
		if (!this.persist && this.conns.web.length === 0) {

			// Disconnect all our connections.
			for (conn in this.conns.irc) {
				if (this.conns.irc.hasOwnProperty(conn) {
					this.conns.irc[conn].disconnect("mintIrc (http://mintIrc.com/)");
				}
			}

			// Take us out of the online users.
			var id = onlineUsers.indexOf(this);
			delete onlineUsers[id];
		}
	};
};
