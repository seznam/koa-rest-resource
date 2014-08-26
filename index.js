var Route = require("koa-router/lib/route");
var debug = require("debug")("koa-rest-resource");
var assert = require('assert');

function Manager(){
    this.routes = [];
    this.namedRoutes = {};
    this.methods = ["get", "post", "put", "delete", "link", "unlink"];
}

Manager.prototype.resource = function(name, path, resource){
    allowed = [];
    for(var m = 0; m < this.methods.length; m++){
        method = this.methods[m].toLowerCase();
        if(method in resource){
            assert(resource[method].constructor.name == "GeneratorFunction", "Method ['" + method + "'] MUST be a generator function");
            allowed.push(method);
        }
    }
    assert(allowed.length > 0, "Resource ['" + name + "'] MUST implement at least one HTTP method");

    debug("Resource [%s] registered on %s with methods: %s", name, path, allowed);

    var route = new Route(path, allowed, [function(){return resource;}], name);
    this.routes.push(route);
    if(name){
        this.namedRoutes[name] = route;
    }
};

Manager.prototype.url = function(name, params){
    if(name in this.namedRoutes){
        var route = this.namedRoutes[name];
        var args = Array.prototype.slice.call(arguments, 1);
        var url = route.url.apply(route, args);
        debug("Generated route %s", url);
        return url;
    }

    return new Error("No route found for resource: " + name);
};

Manager.prototype.match = function(path){
    var routes = this.routes;
    var matchedRoutes = [];

    for (var len = routes.length, i=0; i<len; i++) {
        debug('test "%s" %s', routes[i].path, routes[i].regexp);

        var params = routes[i].match(path);
        if (params) {
            debug('match "%s" %s', routes[i].path, routes[i].regexp);
            matchedRoutes.push({ route: routes[i], params: params });
        }
    }

    return matchedRoutes.length > 0 ? matchedRoutes : false;
};

Manager.prototype.middleware = function(){
    var manager = this;
    return function* dispatch(next){

        var matchedRoutes = manager.match(this.request.path);
        // Parameters for this route
        if (!(this.params instanceof Array)) {
            this.params = [];
        }

        debug('%s %s', this.method, this.path);

        // Find routes matching requested path
        if (matchedRoutes) {
            var methodsAvailable = {};

            // Find matched route for requested method
            for (var len = matchedRoutes.length, i=0; i<len; i++) {
                var route = matchedRoutes[i].route;
                var params = matchedRoutes[i].params;

                for (var l = route.methods.length, n=0; n<l; n++) {
                    var method = route.methods[n];

                    methodsAvailable[method] = true;

                    // if method and path match, dispatch route middleware
                    if (method === this.method) {
                        this.route = route;

                        // Merge the matching routes params into context params
                        merge(this.params, params);

                        debug('dispatch "%s" %s', route.path, route.regexp);
                        return yield (route.middleware())[method.toLowerCase()].call(this, next);
                    }
                }
            }
            this.status = (this.method === 'OPTIONS' ? 204 : 405);
            this.set('Allow', Object.keys(methodsAvailable).join(", "));
        } else {
            return yield next;
        }

        if (!~router.methods.indexOf(this.method.toLowerCase())) {
            this.status = 501;
        }
    };
};

function merge(a, b) {
  if (!b) return a;
  for (var k in b) a[k] = b[k];
  return a;
}

module.exports = function(){
    return new Manager();
};


/*

USAGE :
var manager = require("koa-rest-resource")();

manager.addResource("channels", "/channels", new Channels());
manager.addResource("channel", "/channel/:uuid", new Channel());

manager.url("channel", {uuid: 123});


koa.use(manager.middleware());
*/