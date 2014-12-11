var ModuleTestWMZLib = (function(global) {

var _runOnNode = "process" in global;
var _runOnWorker = "WorkerLocation" in global;
var _runOnBrowser = "document" in global;

return new Test("WMZLib", {
        disable:    false,
        browser:    true,
        worker:     true,
        node:       true,
        button:     true,
        both:       true, // test the primary module and secondary module
    }).add([
        testWMZLib,
    ]).run().clone();

function testWMZLib(test, pass, miss) {

    test.done(miss());
}

})((this || 0).self || global);

