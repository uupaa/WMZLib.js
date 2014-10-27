(function(global) {
"use strict";

// --- dependency modules ----------------------------------
var WMInflate = global["WMInflate"];
var WMAdler32 = global["WMAdler32"];

// --- define / local variables ----------------------------
//var _runOnNode = "process" in global;
//var _runOnWorker = "WorkerLocation" in global;
//var _runOnBrowser = "document" in global;
//

// --- class / interfaces ----------------------------------
function WMZLib() {
}

//{@dev
WMZLib["repository"] = "https://github.com/uupaa/WMZLib.js"; // GitHub repository URL. http://git.io/Help
//}@dev

WMZLib["inflate"] = WMZLib_inflate; // WMZLib.inflate(source:Uint8Array, options:Object = {}):Uint8Array

// --- implements ------------------------------------------
function WMZLib_inflate(source,    // @arg Uint8Array - deflated source
                        options) { // @arg Object = {} - { verify, verbose, bufferSize }
                                   // @options.verify Boolean = false - check adler32
                                   // @options.verbose Boolean = false
                                   // @options.bufferSize Integer = 0x8000 - 32kb
                                   // @ret Uint8Array - inflated source. length = 0 is error.
//{@dev
    $valid($type(source, "Uint8Array"),   WMZLib_inflate, "source");
    $valid($type(options, "Object|omit"), WMZLib_inflate, "options");
    if (options) {
        $valid($type(options.verify, "Boolean|omit"), WMZLib_inflate, "options.verify");
        $valid($type(options.verbose, "Boolean|omit"), WMZLib_inflate, "options.verbose");
        $valid($type(options.bufferSize, "Integer|omit"), WMZLib_inflate, "options.bufferSize");
    }
//}@dev

    options = options || {};

    // --- decode zlib header ---
    // | HEADER x 2 | DEFLATED DATA | ADLER32 CHECKSUM x 4 |
    //  ~~~~~~~~~~~~
    var header = _decodeZlibHeader(source, 0);

    // --- decompress zlib data ---
    // | HEADER x 2 | DEFLATED DATA | ADLER32 CHECKSUM x 4 |
    //                ~~~~~~~~~~~~~
    var inflate = new WMInflate(source, header.length, options);
    var buffer = inflate.decompress();      // Uint8Array
    var cursor = inflate.getStreamCursor(); // get cursor after decompress.

    // --- verify ---
    // | HEADER x 2 | DEFLATED DATA | ADLER32 CHECKSUM x 4 |
    //                                ~~~~~~~~~~~~~~~~~~~~
    if (options["verify"]) {
        var adler1 = WMAdler32(buffer);
        var adler2 = (source[cursor    ]  << 24 |
                      source[cursor + 1]  << 16 |
                      source[cursor + 2]  <<  8 |
                      source[cursor + 3]) >>> 0;

        if (adler1 !== adler2) {
            throw new TypeError("zlib invalid Adler32 checksum");
        }
    }

    // --- GC ---
    inflate = null;

    return buffer;
}

function _decodeZlibHeader(source,   // @arg Uint8Array - zlib source.
                           cursor) { // @arg Integer - cursor cursor.
                                     // @ret ZlibHeaderObject - decoded header.
    var ZLIB_COMPRESSION_METHOD_DEFLATE = 0x8;
    var zlibHeader = {
            CMF: {
                CINFO:  0,  // 4bits
                CM:     0   // 4bits compression method (0x8 = DEFLATE)
            },
            FLG: {
                FLEVEL: 0,  // 2bits
                FDICT:  0,  // 1bit
                FCHECK: 0   // 5bits
            },
            length: 2       // zlib header length
        };

    var cmf = source[cursor];
    var flg = source[cursor + 1];
    var checkSum = ((cmf << 8) + flg) % 31;

    zlibHeader.CMF.CINFO  = (cmf >> 4) & 0x0f; // oooo----
    zlibHeader.CMF.CM     = (cmf     ) & 0x0f; // ----oooo
    zlibHeader.FLG.FLEVEL = (flg >> 6) & 0x03; // oo------
    zlibHeader.FLG.FDICT  = (flg >> 5) & 0x01; // --o-----
    zlibHeader.FLG.FCHECK = (flg     ) & 0x1f; // ---ooooo

    if (checkSum !== 0) {
        throw new TypeError("zlib header check-sum error");
    }
    if (zlibHeader.CMF.CM !== ZLIB_COMPRESSION_METHOD_DEFLATE) {
        throw new TypeError("zlib header unsupported compression method");
    }
    if (zlibHeader.FLG.FDICT) {
        throw new TypeError("zlib header FDICT is not supported");
    }
    return zlibHeader;
}

// --- validate / assertions -------------------------------
//{@dev
function $valid(val, fn, hint) { if (global["Valid"]) { global["Valid"](val, fn, hint); } }
function $type(obj, type) { return global["Valid"] ? global["Valid"].type(obj, type) : true; }
//function $keys(obj, str) { return global["Valid"] ? global["Valid"].keys(obj, str) : true; }
//function $some(val, str, ignore) { return global["Valid"] ? global["Valid"].some(val, str, ignore) : true; }
//function $args(fn, args) { if (global["Valid"]) { global["Valid"].args(fn, args); } }
//}@dev

// --- exports ---------------------------------------------
if ("process" in global) {
    module["exports"] = WMZLib;
}
global["WMZLib" in global ? "WMZLib_" : "WMZLib"] = WMZLib; // switch module. http://git.io/Minify

})((this || 0).self || global); // WebModule idiom. http://git.io/WebModule

