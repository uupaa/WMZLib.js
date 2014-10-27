# WMZLib.js [![Build Status](https://travis-ci.org/uupaa/WMZLib.js.png)](http://travis-ci.org/uupaa/WMZLib.js)

[![npm](https://nodei.co/npm/uupaa.wmzlib.js.png?downloads=true&stars=true)](https://nodei.co/npm/uupaa.wmzlib.js/)

zlib functions.

WMZLib.js is a fork from [zlib.js](https://github.com/imaya/zlib.js)

## Document

- [WMZLib.js wiki](https://github.com/uupaa/WMZLib.js/wiki/WMZLib)
- [WebModule](https://github.com/uupaa/WebModule)
    - [Slide](http://uupaa.github.io/Slide/slide/WebModule/index.html)
    - [Development](https://github.com/uupaa/WebModule/wiki/Development)

## How to use

### Browser

```js
<script src="lib/WMZLib.js"></script>
<script>
var source = new Uint8Array(...);
var result = WMZLib.inflate(source);
</script>
```

### WebWorkers

```js
importScripts("lib/WMZLib.js");

...
```

### Node.js

```js
var WMZLib = require("lib/WMZLib.js");

...
```
