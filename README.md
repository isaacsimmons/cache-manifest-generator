# Cache Manifest Middleware #

This [connect](https://github.com/senchalabs/connect) / [express](http://expressjs.com/) middleware component is intended to make development of HTML5 offline apps easier.

When using an offline cache.manifest, the browser will not request new versions of site resources unless the manifest file itself is updated.
Dynamically generating the cache manifest file and marking it with a last modified timestamp can simplify the development process.

This can be accomplished efficiently by observing a set of files and directories for changes and serving manifest directly from memory.
This monitoring updates in realtime as a part of the same node process as your server and can watch multiple folders recursively for modifications, creations, and deletions.

### Disclaimers ###

This is intended for use during development only as deployed applications will not require such frequent change monitoring.
You may also want to use some manner of client-side JavaScript application cache event monitoring such as [AppCache Nanny](https://github.com/gr2m/appcache-nanny) or <https://jonathanstark.com/blog/debugging-html-5-offline-application-cache> in order to monitor and manage update events.
Finally, `Cache-Control: no-cache` headers should be sent along with all resources served so as to avoid conflicts between the HTML5 Offline Cache and regular HTTP caching mechanisms.

## Installation ##

    npm install cache-manifest-middleware

## Usage ##

    var express = require('express');
    var manifest = require('cache-manifest-generator');

    var app = express();
    var generator = manifest(paths, config);
    app.get('/cache.manifest', generator);

### paths ###

The first argument must be an array containing one or more paths to include in the main CACHE portion of the manifest.
Each path must be an object with a `file` property that specifies either a relative or an absolute path to a file or directory.
If it is a directory, then any files contained within it (and its subdirectories, recursively) will be included.
Additionally, each path may contain a `url` property that specifies where the files will be made available in the site.
If the `file` path is relative and the `url` is omitted, they will be assumed to be the same.

### config ###

The second argument is an optional config object that supports the following (optional) keys:

* `readyCallback`: Callback function called once when the initial directory scan has completed. The callback gets one argument `(generator)` -- the same object as the manifest return value. The server will function before this event has been fired, but may not contain all manifest entries yet.
* `updateListener`: Callback function called after every update to the manifest file. The callback gets one argument `(manifest)`, an object with `CACHE`, `FALLBACK`, `NETWORK`, `COMMENT`, and `TIMESTAMP` properties.
* `fileListener`: Callback function called after every filesystem change in an observed directory, whether or not the change triggers a modification to the manifest file. The callback gets two arguments `(evt, evtPath)`. The first is `'update'`, `'create'`, or `'delete'`, and the second is the path to the file or directory.
* `catchupDelay`: Number of milliseconds to wait after filesystem events during which things like the creation of editor temp files will be ignored (default: `500`) (see [watchr](https://github.com/bevry/watchr))
* `network`: An array of strings to include in the `NETWORK:` portion of the manifest file. (default: `['*']`)
* `fallback`: An array of strings to include in the `FALLBACK:` portion of the manifest file. (default: `[]`)

### return ###

Connect/express plugin. A function with that takes two arguments `(req, res)` and serves the cache manifest in response to all requests.
It will set the headers `Cache-Control: no-cache` and `Content-Type: text/cache-manifest`.

## Example ##

An example server using express and serving static content out of two different locations

    var express = require('express');
    var manifest = require('cache-manifest-generator');

    var app = express();

    //Set Cache-Control: no-cache on all files served during development
    app.use(function(req, res, next) {
      res.set('Cache-Control', 'no-cache');
      next();
    });

    app.get('/cache.manifest', manifest([
      { file: 'transpiler_output', url: '/js' },
      { file: 'site', url: '/' }
    ]));

    app.use(express.static('site'));
    app.use('/js', express.static('transpiler_output'));

    app.listen(8000);

## Tests ##

Run the [Mocha](https://mochajs.org/)-based tests with `npm test`.

## License ##

MIT
