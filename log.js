'use strict';
/**
 * Adds a log method to the req which returns a logger that logs messages with request specific information.
 */
var
	log   = require('x-log'),
	merge = require('x-common').merge,
	x     = require('x-common').extend,
	stats = require('x-server-stats');
/**
 * Extends the standard logger with the additional data to log.
 */
var RequestLogger = {

	extend:function (msg) {
		var extenders = this.extenders;
		if (extenders) {
			for (var i = 0, l = extenders.length; i < l; i++) {
				msg = merge(msg, extenders[i].call(this.request));
			}
		}
		return msg;
	},
	
	add:function (f/*function to extend log message, called with request as this, should return object to extend msg*/) {
		if (typeof(f) == 'string'){
			f = function (property) {
				return function () {
					var r = {};
					r[property] = this[property];
					return r;
				};
			}(f);
		}
		this.extenders = this.extenders || [];
		this.extenders.push(f);
	}
};

/**
 * Adds the standard log levels defined in 'util/log.js' to the request logger object.
 */
function setLevels() { // request logger must have same methods as log
	for (var level in log.levels) { // define functions if available in log
		if (log[level]){
			RequestLogger[level] = function (level) {
				return function (msg, meta) {
					meta = meta || msg || {};
					if ('string' == typeof meta) meta = {};
					if ('string' != typeof msg) msg = '' + msg;
					log[level](msg, x(this.extend(meta),{name:this.name}));
				};
			}(level);
		}
		else {
			if (RequestLogger[level]) {
				delete RequestLogger[level];
			}
		}
	}
}

setLevels(); // set them now and later on each change
log.level_listeners.push(setLevels);

/**
 * Midlleware function to attach the logger to the request,
 * automatically log the given name, use __filename to use the current file name
 * automatically logging of the begin and end of the request etc.
 */
module.exports = function (req, res, next) { // x-wapcli must exist and match
	x(req, {
		_logger: function(){ var o=Object.create(RequestLogger); o.request=req; return o; }(),
		log:function (name) {
			var log = Object.create(req._logger);
			log.name = name;
			return log;
		}
	});
	var req_log = req.log ? req.log(__filename) : {};
	
	var begin = +new Date();
	req_log.debug && req_log.debug('request begin', {
		request: {method:req.method, url:req.url, headers:req.headers, trailers:req.trailers, begin:begin}
	});
	
	// replace end function to record request end
	var res_end = res.end;
	res.end = function (chunk, encoding) {
		res.end = res_end; // replace orignal function back after calling this new function
		res.end(chunk, encoding); // call original
		
		// log
		var end = + new Date();
		var request = {method:req.method, url:req.url, headers:req.headers, trailers:req.trailers, statusCode: res.statusCode, begin:begin, end:end, duration:end - begin};
		
		req_log.info && req_log.info('request end', {request:request} );
		
		request = req_log.extend(request);
		stats.request(request); // calculate stats
	};
	
	next && next();
};
