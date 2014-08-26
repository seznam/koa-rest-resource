var assert = require("assert");
var co = require("co");
var Manager = require("./index");
var testagent = require("supertest");
var agent = require("thunkagent");
var koa = require("koa");
var error = require("koa-error");


testagent.Test.prototype.thunk = agent.Request.prototype.thunk;

require('mocha-jshint')();

function API(middleware) {
    var app = koa();
    if(process.env.LOGGER == "1")
        app.use(logger());
    app.use(error());
    app.use(middleware);
    app.on("error", function(err) {
        if (!err.expose) {
            console.log("server error", err);
        }
    });
    return app.listen();
}

describe.only("Manager", function(){
    describe("Resource registry", function(){
        it("should register resource", co(function*(){
            var _ = Manager();
            var resource = {
                get: function*(){}
            };
            _.resource("resource", "/resource", resource);
        }));
        it("Should decline empty resource", co(function*(){
            var _ = Manager();
            assert.throws(function(){_.resource("resource", "/resource", {});}, assert.AssertionError);
        }));
    });

    describe("Resource routing", function(){
        it("Should route request to proper resource", co(function*(){
            var _ = Manager();
            var resource1 = {
                get: function*(){
                    this.status = 200;
                    this.body = {};
                }
            };
            var resource2 = {
                get: function*(){this.status = 404;},
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
        it("Should convert resource name to uri", co(function*(){
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
});