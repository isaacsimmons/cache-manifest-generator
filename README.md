# Cache Manifest Middleware #

This [connect](https://github.com/senchalabs/connect)/[express](http://expressjs.com/) middleware component is intended to make development of HTML5 offline apps easier.

When using an offline cache.manifest, the browser will not request new versions of site resources unless the manifest file itself is updated.
Dynamically generating the cache manifest file and marking it with a last modified timestamp can simplify the development process.

This can be accomplished efficiently by observing a set of files and directories for changes and serving manifest directly from memory.
This monitoring updates in realtime as a part of the same node process as your server and can watch multiple folders recursively for modifications, creations, and deletions.

This is intended for use during development only.
A deployed application ought not need such frequent change monitoring.
You may also want to use some manner of application cache event monitoring such as [AppCache Nanny](https://github.com/gr2m/appcache-nanny) or <https://jonathanstark.com/blog/debugging-html-5-offline-application-cache>.
Finally, Cache-Control headers should probably be sent along with all resources served so as to avoid conflicts between the Offline Cache and regular HTTP caching mechanisms.

## Installation ##

    npm install cache-manifest-middleware

## Usage ##

There are two arguments to the manifest generator.
The first argument is an array of pathes to watch, the second optional argument is an object containging additional parameters.

Paths looks like:

Options include:


## Example ##

An example server using express and serving static content out of two different locations

    var express = require('express');
    var manifest = require('cache-manifest-middleware');

    var app = express();

    //Set Cache-Control: no-cache on all files served during development
    app.use(function(req, res, next) {
      res.set('Cache-Control', 'no-cache');
      next();
    });

    app.get('/cache.manifest', manifest([
      { file: 'transpiler_output', url: '/js' },
      { file: 'site', url: '/' }
    ]);

    app.use(express.static('site'));
    app.use('/js', express.static('transpiler_output'));

    app.listen(8000);

    //TODO: test this sample code

## Tests ##

Run the [Mocha](https://mochajs.org/)-based tests with `npm test`.

## License ##

MIT