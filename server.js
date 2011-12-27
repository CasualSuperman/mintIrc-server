var lib = {
	app : require('http').createServer(handler),
	fs  : require('fs'),
	net : require('net'),
	url : require('url'),
	mime: require('mime'),
	path: require('path'),
	irc : require('irc'),
	user: require('./user'),
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

