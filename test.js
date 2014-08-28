var assert = require("assert");
var co = require("co");
var Manager = require("./index");
var testagent = require("supertest");
var agent = require("thunkagent");
var koa = require("koa");
var hal = require("halson");


testagent.Test.prototype.thunk = agent.Request.prototype.thunk;

require('mocha-jshint')();

function API(middleware) {
    var app = koa();
    if(process.env.LOGGER == "1")
        app.use(logger());
    app.use(middleware);
    app.on("error", function(err) {
        console.log("server error", err.stack);
    });
    return app.listen();
}

var HalsonResource = function(methods){
    methods.extract = function(bodies, relation, profile){
        bodies = [].concat(bodies);
        var resources = [];
        bodies.forEach(function(body){
            var links = body.getLinks(relation);
            for(var i = 0, len = links.length; i < len; i++){
                if(links[i].href){
                    resources.push(links[i].href);
                }
            }
        });
        return resources;
    };
    methods.embed = function(bodies, relation, embeds){
        bodies = [].concat(bodies);
        embeds = [].concat(embeds);

        bodies[0].addEmbed(relation, embeds[0]);
    };
    return methods;
};

describe("Manager", function(){
    describe("Resource registry", function(){
        it("should register resource", co(function*(){
            var _ = Manager();
            var resource = {
                get: function*(){}
            };
            _.resource("resource", "/resource", resource);
        }));
        it("should decline empty resource", co(function*(){
            var _ = Manager();
            assert.throws(function(){_.resource("resource", "/resource", {});}, assert.AssertionError);
        }));
    });

    describe("Resource routing", function(){
        it("should route request to proper resource", co(function*(){
            var _ = Manager();
            var resource1 = {
                get: function*(ctx){
                    ctx.status = 200;
                    ctx.body = {};
                }
            };
            var resource2 = {
                get: function*(ctx){ctx.status = 404;},
                post: function*(){}
            };

            _.resource("r1", "/r1", resource1);
            _.resource("r2", "/r2", resource2);

            yield testagent(API(_.middleware()))
                .get("/r1")
                .expect(200)
                .thunk();

            yield testagent(API(_.middleware()))
                .get("/r2")
                .expect(404)
                .thunk();
        }));
    });

    describe("Resource uri generating", function(){
        it("should convert resource name to uri", co(function*(){
            var _ = Manager();
            var resource = { get: function*(){}};
            _.resource("r1", "/r1", resource);

            assert.equal(_.url("r1"), "/r1");
        }));

        it("Should convert resource name to uri - with params", co(function*(){
            var _ = Manager();
            var resource = { get: function*(){}};
            _.resource("r1", "/r1/:uuid", resource);

            assert.equal(_.url("r1", 123), "/r1/123");
        }));
    });

    describe("Resource formating", function(){
        it("should double", co(function*(){
            var _ = Manager();
            var resource = {
                get: function*(ctx){
                    ctx.body = {
                        number: parseInt(ctx.params.number)
                    };
                },
                format: function(body){
                    // format keywords
                    body.number = 2 * body.number;
                    return body;
                }
            };

            _.resource("r", "/r/:number", resource);

            var res = yield testagent(API(_.middleware()))
                .get("/r/1")
                .buffer(true)
                .expect(200)
                .thunk();

            var body = JSON.parse(res.text);
            assert.equal(body.number, 2);
        }));

        it("should extract _links from default view", co(function*(){
            var _ = Manager();
            
            var resource1 = HalsonResource({
                get: function*(ctx){
                    var uuid = ctx.params.uuid;
                    ctx.body = hal().addLink("self", ctx.path);
                },
                format: function(body){
                    body.addLink("relation", {href: (body.getLink("self").href).concat("/data"), profile: "data-resource"});
                    return body;
                },
                shortcut: function(word){return {extract: {"relation": {}}};}
            });

            var resource2 = {
                get: function*(ctx){
                    ctx.body = yield this.read(ctx, ctx.path, false); //TODO querystring, params ?!
                },
                read: function*(ctx, uri, embed){
                    // TODO jak predat jiny stav nez 200?
                    // if(!embed) ctx.status = 403
                    // else return;
                    return {uuid: 1};
                }
            };

            _.resource("r", "/r/:uuid", resource1);
            _.resource("data", "/r/:uuid/data", resource2);

            var res = yield testagent(API(_.middleware()))
                .get("/r/1?view=full")
                .buffer(true)
                .expect(200)
                .thunk();

            var body = JSON.parse(res.text);
            assert.equal(body._embedded.relation.uuid, 1);
        }));

        it("should extract _links in nested resources (recursive)", co(function*(){
            var _ = Manager();
            
            var resource1 = HalsonResource({
                get: function*(ctx){
                    ctx.body = hal()
                        .addLink("self", ctx.path)
                        .addLink("relation", ctx.path.concat("/data"));
                },
                shortcut: function(word){return {extract: {"relation": {}}};}
            });

            var resource2 =  HalsonResource({
                get: function*(ctx){},
                read: function*(ctx, uri, embed){
                    return hal()
                        .addLink("self", uri)
                        .addLink("nested-relation", uri.concat("/nested"));
                },
                shortcut: function(word){return {extract: {"nested-relation": {}}};}
            });

            var resource3 =  HalsonResource({
                get: function*(ctx){},
                read: function*(ctx, uri, embed){
                    return hal()
                        .addLink("self", uri);
                }
            });


            _.resource("r", "/r/:uuid", resource1);
            _.resource("data", "/r/:uuid/data", resource2);
            _.resource("data-nested", "/r/:uuid/data/nested", resource3);

            var res = yield testagent(API(_.middleware()))
                .get("/r/1?view=full")
                .buffer(true)
                .expect(200)
                .thunk();

            var body = JSON.parse(res.text);
            assert.equal(body._embedded.relation._embedded["nested-relation"]._links.self.href, "/r/1/data/nested");
        }));
    });
});