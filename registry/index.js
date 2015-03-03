'use strict';

var appStart = require('./app-start');
var colors = require('colors');
var express = require('express');
var format = require('stringformat');
var http = require('http');
var multer  = require('multer');
var path = require('path');
var RequestInterceptor = require('./request-interceptor');
var settings = require('../resources/settings');
var validator = require('./domain/validator');
var _ = require('underscore');

var routes = require('./routes');

module.exports = function(options){

  var hasPrefix = false,
      self = this,
      server,
      withLogging = !_.has(options, 'verbosity') || options.verbosity > 0,
      validationResult = validator.registryConfiguration(options),
      baseUrlFunc;

  if(!validationResult.isValid){
    throw validationResult.message;
  }

  this.close = function(callback){
    if(!!server){
      server.close(callback);
    } else {
      callback('not opened');
    }
  };

  this.init = function(){

    routes.init(options);

    var app = express();
    
    app.set('port', process.env.PORT || options.port);
    app.use(function (req, res, next) {
      res.removeHeader('X-Powered-By');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, PUT');

      if(_.isFunction(options.baseUrl)){
        baseUrlFunc = options.baseUrl;
      }

      if(!_.isUndefined(baseUrlFunc)){
        options.baseUrl = baseUrlFunc({
          host: req.headers.host,
          secure: req.secure
        });
      }

      res.conf = options;

      if(!!options.dependencies){
        res.injectedDependencies = options.dependencies;
      }

      next();
    });
    
    if(!options.local){
      app.use(multer({ 
        dest: options.tempDir || settings.registry.defaultTempPath,
        fieldSize: 10,
        rename: function(fieldname, filename){
          return format('{0}-{1}.tar', filename.replace('.tar', '').replace(/\W+/g, '-').toLowerCase(), Date.now());
        }
      }));
    }

    if(!options.publishAuth){
      options.beforePublish = function(req, res, next){ next(); };
    } else {
      options.beforePublish = express.basicAuth(options.publishAuth.username, options.publishAuth.password);
    }
    
    if(withLogging){
      app.use(express.logger('dev'));
    }

    app.use(express.json());
    app.use(express.urlencoded());
    app.set('json spaces', 0);

    if(!!options.onRequest){
      var interceptor = new RequestInterceptor(options.onRequest);
      app.use(interceptor);
    }
    
    app.use(app.router);

    if('development' === app.get('env')){
      app.use(express.errorHandler());
    }

    if(!options.prefix){
      options.prefix = '/';
    } else {
      hasPrefix = true;
      app.get('/', function(req, res){ res.redirect(options.prefix); });
    }

    app.get(options.prefix + 'oc-client/client.js', routes.staticRedirector);

    if(options.local){
      app.get(format('{0}:componentName/:componentVersion/{1}*', options.prefix, settings.registry.localStaticRedirectorPath), routes.staticRedirector);
    } else {
      app.put(options.prefix + ':componentName/:componentVersion', options.beforePublish, routes.publish);
    }

    app.get(options.prefix, routes.index);

    if(hasPrefix){
      app.get(options.prefix.substr(0, options.prefix.length - 1), routes.index);
    }

    app.get(format('{0}{1}{2}', options.prefix, ':componentName/:componentVersion', settings.registry.componentInfoPath), routes.componentInfo);
    app.get(format('{0}{1}{2}', options.prefix, ':componentName', settings.registry.componentInfoPath), routes.componentInfo);
    app.get(options.prefix + ':componentName/:componentVersion', routes.component);
    app.get(options.prefix + ':componentName', routes.component);

    if(!!options.routes){
      _.forEach(options.routes, function(route){
        app[route.method.toLowerCase()](route.route, route.handler);
      });
    }

    self.app = app;
  };

  this.start = function(callback){

    if(!_.isFunction(callback)){
      callback = _.noop;
    }

    appStart(options, function(err, res){

      if(!!err){
        return callback(err.msg);
      }

      server = http.createServer(self.app);

      server.listen(self.app.get('port'), function(){
        if(withLogging){
          console.log(format('Registry started at port {0}'.green, self.app.get('port')));
        }
        callback(null, self.app);
      });

      server.on('error', function(e){
        callback(e);
      });
    });
  };

  this.init();
};