(function(global) {
"use strict";

// --- dependency modules ----------------------------------
var WMHuffman = global["WMHuffman"];

// --- define / local variables ----------------------------
//var _runOnNode = "process" in global;
//var _runOnWorker = "WorkerLocation" in global;
//var _runOnBrowser = "document" in global;

var HUFFMAN_LENGTH_CODE_TABLE = new Uint16Array([
        0x0003, 0x0004, 0x0005, 0x0006, 0x0007, 0x0008, 0x0009, 0x000a, 0x000b,
        0x000d, 0x000f, 0x0011, 0x0013, 0x0017, 0x001b, 0x001f, 0x0023, 0x002b,
        0x0033, 0x003b, 0x0043, 0x0053, 0x0063, 0x0073, 0x0083, 0x00a3, 0x00c3,
        0x00e3, 0x0102, 0x0102, 0x0102
    ]);
var HUFFMAN_DIST_CODE_TABLE = new Uint16Array([
        0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0007, 0x0009, 0x000d, 0x0011,
        0x0019, 0x0021, 0x0031, 0x0041, 0x0061, 0x0081, 0x00c1, 0x0101, 0x0181,
        0x0201, 0x0301, 0x0401, 0x0601, 0x0801, 0x0c01, 0x1001, 0x1801, 0x2001,
        0x3001, 0x4001, 0x6001
    ]);
var HUFFMAN_ORDER = new Uint16Array([
        16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15
    ]);
var HUFFMAN_LENGTH_EXTRA_BITS_TABLE = new Uint8Array([
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4,
        5, 5, 5, 5, 0, 0, 0
    ]);
var HUFFMAN_DIST_EXTRA_BITS_TABLE = new Uint8Array([
        0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10,
        10, 11, 11, 12, 12, 13, 13
    ]);
var FIXED_HUFFMAN_LENGTH_CODE_TABLE = (function() {
        var lengths = new Uint8Array(288);

        for (var i = 0; i < 288; ++i) {
            lengths[i] = (i <= 143) ? 8 :
                         (i <= 255) ? 9 :
                         (i <= 279) ? 7 : 8;
        }
        return WMHuffman["buildTable"](lengths);
    })();
var FIXED_HUFFMAN_DISTANCE_CODE_TABLE = (function() {
        var lengths = new Uint8Array(30);

        for (var i = 0; i < 30; ++i) {
            lengths[i] = 5;
        }
        return WMHuffman["buildTable"](lengths);
    })();
var BTYPE_UNCOMPRESSED    = 0;
var BTYPE_FIXED_HUFFMAN   = 1;
var BTYPE_DYNAMIC_HUFFMAN = 2;
var BTYPE_UNKNOWN         = 3;

// --- class / interfaces ----------------------------------
function WMInflate(input,     // @arg Uint8Array - Deflate stream.
                   cursor,    // @arg Integer - Deflate stream cursor.
                   options) { // @arg Object - { verify, verbose, bufferSize }
                              // @options.verify Boolean = false
                              // @options.verbose Boolean = false
                              // @options.bufferSize Integer = 0x8000 - 32kb
    options = options || {};

    this._verify       = options["verify"] || false;
    this._verbose      = options["verbose"] || false;
    this._streamBuffer = input;
    this._streamCursor = cursor;
    this._outputBuffer = new Uint8Array(options["bufferSize"] || 0x8000);
    this._outputCursor = 0;

    // --- work ---
    this._lastRLE      = 0; // keep last RLE value
    this._litlenTable  = null; // WMHuffman.buildTable result. { huffmanCodeTable:Uint32Array, maxCodeLength:Integer, minCodeLength:Integer }
    this._bitStreamReaderBuffer = 0;
    this._bitStreamReaderBufferSize = 0;
}

WMInflate["prototype"]["decompress"]      = WMInflate_decompress;      // WMInflate#decompress():Uint8Array
WMInflate["prototype"]["getStreamCursor"] = WMInflate_getStreamCursor; // WMInflate#getStreamCursor():Integer

// --- implements ------------------------------------------
function WMInflate_decompress() { // @ret Uint8Array - OutputBuffer
    while ( _parseDeflatedBlock(this) ) {
        //
    }
    var result = this._outputBuffer.subarray(0, this._outputCursor); // shrink

    // --- GC ---
//    this._streamBuffer = null;
//    this._outputBuffer = null;

    return result;
}

function WMInflate_getStreamCursor() { // @ret Integer - stream cursor
    return this._streamCursor;
}

function _parseDeflatedBlock(that) { // @arg this
                                     // @ret Boolean - found BFINAL flag, break the loop.
    // [!] The zlib Deflate stream reading direction is left-to-right,
    //     But bits reading direction is right-to-left.
    //
    //          Deflate stream
    //          +--+--+--+--+--+---
    //          |01|0C|00|F3|FF|...
    //          +--+--+--+--+--+---
    //           ~~  ----> read the first byte from Deflated stream.
    //            |
    //            v
    //          +--------+
    //          |00000001|
    //          +--------+
    //                  ~ ---> BFINAL: BFINAL is set if and only if this is the last block of the data set.
    //                ~~  ---> BTYPE:  BTYPE specifies how the data are compressed.
    //           ~~~~~    ---> Padding.
    //
    var bfinal = _readBits(that, 1);
    var btype  = _readBits(that, 2);

    switch (btype) {
    case BTYPE_UNCOMPRESSED:    _parseUncompressedBlock(that); break;
    case BTYPE_FIXED_HUFFMAN:   _parseFixedHuffmanBlock(that); break;
    case BTYPE_DYNAMIC_HUFFMAN: _parseDynamicHuffmanBlock(that); break;
    case BTYPE_UNKNOWN:         throw new Error("Unknown BTYPE");
    }
    return !bfinal;
}

function _parseUncompressedBlock(that) {
    //
    //          Deflate stream
    //          +--+--+--+--+--+---
    //          |01|0C|00|F3|FF|...
    //          +--+--+--+--+--+---
    //              ~~~~~ ~~~~~  --> read the 2nd to 5th bytes from Deflated stream.
    //               |     |
    //               v     v
    //          0x000C, 0xFFF3
    //          ~~~~~~           --> LEN:  LEN is the number of data bytes in the block.
    //                  ~~~~~~   --> NLEN: NLEN is the one's complement of LEN.
    //
    var stream = that._streamBuffer;
    var cursor = that._streamCursor;

    // --- skip buffered header bits ---
    that._bitStreamReaderBuffer = 0;
    that._bitStreamReaderBufferSize = 0;

    if ( cursor + 4 >= stream.length ) {
        throw new Error("Invalid uncompressed block length");
    }
    var len  = stream[cursor++] | (stream[cursor++] << 8);
    var nlen = stream[cursor++] | (stream[cursor++] << 8);

    if (len === ~nlen) { // length verify
        throw new Error("invalid uncompressed block header: length verify");
    }
    if (cursor + len > stream.length) {
        throw new Error("stream buffer is broken");
    }

    while (that._outputCursor + len > that._outputBuffer.length) {
        _expandOutputBuffer(that);
    }
    that._outputBuffer.set( stream.subarray(cursor, cursor + len), that._outputCursor);
    that._streamCursor = cursor + len;
    that._outputCursor += len;
}

function _expandOutputBuffer(that) {
    var newOutputBuffer = new Uint8Array(that._outputBuffer.length * 2);

    newOutputBuffer.set(that._outputBuffer);
    that._outputBuffer = newOutputBuffer;

    return that._outputBuffer;
}

function _readBits(that,
                   bitLength) { // @arg Integer
                                // @ret Uint32 - read bits.
                                // @desc read bits from Deflated stream.
    var bitsbuf      = that._bitStreamReaderBuffer;
    var bitsbuflen   = that._bitStreamReaderBufferSize;
    var streamBuffer = that._streamBuffer;
    var streamLength = streamBuffer.length;

    while (bitsbuflen < bitLength) {
        if (that._streamCursor >= streamLength) {
            throw new Error("input buffer is broken");
        }
        // concat octet
        bitsbuf    |= streamBuffer[that._streamCursor++] << bitsbuflen;
        bitsbuflen += 8;
    }

    var result = bitsbuf & ((1 << bitLength) - 1);

    bitsbuf >>>= bitLength;
    bitsbuflen -= bitLength;

    that._bitStreamReaderBuffer     = bitsbuf;
    that._bitStreamReaderBufferSize = bitsbuflen;

    return result;
}

function _readHuffmanCodeByTable(that,
                                 table) { // @arg Object - { huffmanCodeTable, maxCodeLength, minCodeLength }
                                          // @ret Uint16
    var bitsbuf       = that._bitStreamReaderBuffer;
    var bitsbuflen    = that._bitStreamReaderBufferSize;
    var streamBuffer  = that._streamBuffer;
    var streamLength  = streamBuffer.length;
    var maxCodeLength = table.maxCodeLength;

    while (bitsbuflen < maxCodeLength) {
        if (that._streamCursor >= streamLength) {
            break;
        }
        bitsbuf |= streamBuffer[that._streamCursor++] << bitsbuflen;
        bitsbuflen += 8;
    }

    // read max length code length & code (16bit, 16bit)
    var codeWithLength = table.huffmanCodeTable[bitsbuf & ((1 << maxCodeLength) - 1)];
    var codeBitsLength = codeWithLength >>> 16;

    that._bitStreamReaderBuffer     = bitsbuf >> codeBitsLength;
    that._bitStreamReaderBufferSize = bitsbuflen - codeBitsLength;

    return codeWithLength & 0xffff;
}

function _parseFixedHuffmanBlock(that) {
    that._litlenTable = FIXED_HUFFMAN_LENGTH_CODE_TABLE;

    _decodeHuffmanAdaptive(that, FIXED_HUFFMAN_DISTANCE_CODE_TABLE); // { huffmanCodeTable, maxCodeLength, minCodeLength }
}

function _parseDynamicHuffmanBlock(that) {
    var hlit  = _readBits(that, 5) + 257; // number of literal and length codes.
    var hdist = _readBits(that, 5) + 1;   // number of distance codes.
    var hclen = _readBits(that, 4) + 4;   // number of code lengths.
    var codeLengths = new Uint8Array(HUFFMAN_ORDER.length); // code lengths.

    // --- decode code lengths ---
    for (var i = 0; i < hclen; ++i) {
        codeLengths[HUFFMAN_ORDER[i]] = _readBits(that, 3);
    }

    var codeLengthsTable     = WMHuffman["buildTable"](codeLengths); // { huffmanCodeTable, maxCodeLength, minCodeLength }
    var literalAndLengthCode = new Uint8Array(hlit);
    var distanceCodeLengths  = new Uint8Array(hdist);

    that._lastRLE = 0;
    that._litlenTable = WMHuffman["buildTable"](
                            _decodeDynamicHuffman(that, hlit,  codeLengthsTable, literalAndLengthCode));

    _decodeHuffmanAdaptive(that,
                        WMHuffman["buildTable"](
                            _decodeDynamicHuffman(that, hdist, codeLengthsTable, distanceCodeLengths)));
}

function _decodeDynamicHuffman(that,
                               loop,
                               table,     // { huffmanCodeTable, maxCodeLength, minCodeLength }
                               lengths) { // code lengths buffer.
    var rle = that._lastRLE;

    for (var i = 0; i < loop;) {
        var code = _readHuffmanCodeByTable(that, table);
        var repeat = 0;

        switch (code) {
        case 16:
            repeat = 3 + _readBits(that, 2);
            while (repeat--) { lengths[i++] = rle; }
            break;
        case 17:
            repeat = 3 + _readBits(that, 3);
            while (repeat--) { lengths[i++] = 0; }
            rle = 0;
            break;
        case 18:
            repeat = 11 + _readBits(that, 7);
            while (repeat--) { lengths[i++] = 0; }
            rle = 0;
            break;
        default:
            lengths[i++] = code;
            rle = code;
        }
    }

    that._lastRLE = rle;

    return lengths;
}

function _decodeHuffmanAdaptive(that,
                                dist) { // { huffmanCodeTable, maxCodeLength, minCodeLength }
    var outputBuffer = that._outputBuffer;
    var outputCursor = that._outputCursor;
    var outputBufferLength = outputBuffer.length;
    var huffmanCode  = 0; // Uint16

    while ((huffmanCode = _readHuffmanCodeByTable(that, that._litlenTable)) !== 256) {
        // literal
        if (huffmanCode < 256) {
            if (outputCursor >= outputBufferLength) {
                outputBuffer = _expandOutputBuffer(that);
                outputBufferLength = outputBuffer.length;
            }
            outputBuffer[outputCursor++] = huffmanCode;
        } else {
            // length huffmanCode
            var tableCursor = huffmanCode - 257;
            var huffmanCodeLength = HUFFMAN_LENGTH_CODE_TABLE[tableCursor];
            if (HUFFMAN_LENGTH_EXTRA_BITS_TABLE[tableCursor] > 0) {
                huffmanCodeLength += _readBits(that, HUFFMAN_LENGTH_EXTRA_BITS_TABLE[tableCursor]);
            }

            // dist huffmanCode
            huffmanCode = _readHuffmanCodeByTable(that, dist);
            var huffmanCodeDist = HUFFMAN_DIST_CODE_TABLE[huffmanCode];
            if (HUFFMAN_DIST_EXTRA_BITS_TABLE[huffmanCode] > 0) {
                huffmanCodeDist += _readBits(that, HUFFMAN_DIST_EXTRA_BITS_TABLE[huffmanCode]);
            }

            // lz77 decode
            if (outputCursor + huffmanCodeLength > outputBufferLength) {
                outputBuffer = _expandOutputBuffer(that);
                outputBufferLength = outputBuffer.length;
            }
            while (huffmanCodeLength--) {
                outputBuffer[outputCursor] = outputBuffer[(outputCursor++) - huffmanCodeDist];
            }
        }
    }

    while (that._bitStreamReaderBufferSize >= 8) {
        that._bitStreamReaderBufferSize -= 8;
        that._streamCursor--;
    }
    that._outputCursor = outputCursor;
}

// --- validate / assertions -------------------------------
//{@dev
//function $valid(val, fn, hint) { if (global["Valid"]) { global["Valid"](val, fn, hint); } }
//function $type(obj, type) { return global["Valid"] ? global["Valid"].type(obj, type) : true; }
//function $keys(obj, str) { return global["Valid"] ? global["Valid"].keys(obj, str) : true; }
//function $some(val, str, ignore) { return global["Valid"] ? global["Valid"].some(val, str, ignore) : true; }
//function $args(fn, args) { if (global["Valid"]) { global["Valid"].args(fn, args); } }
//}@dev

// --- exports ---------------------------------------------
if ("process" in global) {
    module["exports"] = WMInflate;
}
global["WMInflate" in global ? "WMInflate_" : "WMInflate"] = WMInflate; // switch module. http://git.io/Minify

})((this || 0).self || global); // WebModule idiom. http://git.io/WebModule

