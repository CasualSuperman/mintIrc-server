var app  = require('http').createServer(handler),
	io   = require('socket.io').listen(app),
	fs   = require('fs'),
	net  = require('net'),
	url  = require('url'),
	mime = require('mime'),
	path = require('path'),
	irc  = require('irc');

io.set('log level', 1);
app.listen(80);

function handler(req, res) {
	var uri = url.parse(req.url).pathname;
	var filename = path.join("ui", uri);

	path.exists(filename, function(exists) {
		if (exists) {
			if (fs.statSync(filename).isDirectory()) {
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
	fs.readFile(filename,
		function (err, data) {
			if (err) {
				console.log(err);
				res.writeHead(500);
				return res.end("500 - Internal Application Error");
			}
			var type = mime.lookup(filename);
			res.writeHead(200, {'Content-Type' : type});
			res.end(data);
		}
	);
}

io.sockets.on('connection', function(socket) {
	var client = new irc.Client('irc.foonetic.net', 'mintI-fresh', {
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

