# Cache Manifest Middleware #

This [connect](https://github.com/senchalabs/connect)/[express](http://expressjs.com/) middleware component is intended to make development of HTML5 offline apps easier.
When using the offline cache.manifest, the browser will not request new site resources unless the manifest file itself is updated.
By dynamically generating the cache manifest file and marking it with a last modified timestamp, it is no longer necessary to make manual updates.
By observing a set of files and directories for changes, this can be accomplished efficiently.

This is intended for use in development only, as a deployed application ought not need such frequent change monitoring.
During development, you may also want to use some manner of application cache monitoring such as [AppCache Nanny](https://github.com/gr2m/appcache-nanny) or <https://jonathanstark.com/blog/debugging-html-5-offline-application-cache>.

## Features ##

Freely mix files and directories.
Separate file path mappings and url mappings.
No polling and no filesystem access when serving result. All changes are triggered by observing the filesystem.
Ability to add custom ignore or rewrite patterns.
Sends no-cache header.

## Installation ##

    npm install cache-manifest-middleware

## Usage ##

    var express = require('express');
    var manifest = require('cache-manifest-middleware');

    var app = express();

    app.use(manifest.nocache);
    app.get('/cache.manifest', manifest.generator(['site']);

    app.use(express.static('site'));

    app.listen(8000);

## License ##

MIT