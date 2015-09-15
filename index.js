'use strict';

//TODO: on initial scan, check for the latest timestamp so that re-initialization of the server doesn't needlessly bump the cache.manifest version?

var path    = require('path');
var fs      = require('fs');

var watchr  = require('watchr');
var scanner = require('scandirectory');

function sortedSet() {
  var arr = [];

  function indexOf(val) {
    var min = 0, max = arr.length - 1;
    while (min <= max) {
      var cur = (min + max) / 2 | 0;
      if (arr[cur] < val) {
        min = cur + 1;
      } else if (arr[cur] > val) {
        max = cur - 1;
      } else {
        return cur;
      }
    }
    return ~max;
  }

  arr.insert = function(val) {
    var index = Math.abs(indexOf(val));
    if (arr.length <= index || arr[index] !== val) {
      arr.splice(index, 0, val);
    }
    return arr;
  };

  arr.remove = function(val) {
    var index = indexOf(val);
    if (index >= 0 && arr[index] === val) {
      arr.splice(index, 1);
    }
    return arr;
  };

  return arr;
}

//Paths = array of paths to watch for changes
//Each path is an object with a "file" property and any of the following optional properties: url, ignore, recurse, rewrite
//Last argument can optionally be an "options" object
function serveManifest(paths, opts, callback) {
  if (! Array.isArray(paths)) {
    throw new Error('First argument must be array of paths to watch');
  }
  if (paths.length === 0) {
    throw new Error('Must provide at least one path to watch');
  }
  if (! opts) {
    opts = {};
  }
  if (typeof callback !== 'function') {
    callback = function() {};
  }

  var watchers = [];
  var allFiles = sortedSet();
  var completedScans = 0;
  var manifestVersion = new Date().toISOString();

  function checkReady() {
    if (completedScans === paths.length && watchers.length === paths.length) {
      callback(serveResponse);
    }
  }

  function usePath(p) {
    if (typeof p === 'string') {
      p = { file: p, url: p };
    }
    if (! ('file' in p)) {
      throw new Error('Path object must contain a "file" property');
    }
    var filePath = p['file'];
    var urlPath = p['url'] || p['file'];
    if (! urlPath.startsWith('/')) {
      urlPath = '/' + urlPath;
    }

    filePath = path.format(path.parse(filePath));
    //TODO: maybe turn all paths into absolute ones?

    function toUrl(orig) {
      //console.log('converting ' + orig);
      var relPath = orig.substr(filePath.length);
      if (relPath.startsWith(path.sep)) {
        relPath = relPath.substr(path.sep.length);
      }
      //Convert to /'s for URL in case the filePath has \ separators
      return urlPath + '/' + path.posix.format(path.parse(relPath));
      //TODO: will this work for the case where the whole path is a single file instead of a directory?
    }

    function listener(evt, evtPath) {
      console.log('listen event for ' + evtPath);
      if (! evtPath.startsWith(filePath)) {
        throw new Error('!!!!!!!!!!!!');
      }
      fs.stat(evtPath, function(err, stat) {
        if (stat.isFile()) {
          var url = toUrl(evtPath);
          if (evt === 'delete') {
            allFiles.remove(url);
          } else if (evt === 'create') {
            allFiles.insert(url);
          }
          manifestVersion = new Date().toISOString(); //TODO: use the time from stat? thanks to "catchupDelay" I may not have the right time anymore
          console.log('cache updated');
        }
      });
    }

    fs.stat(filePath, function(err, stat) {
      //TODO: keep track of the max 'mtime' (and maybe drop to second-level accuracy)
      if (stat.isDirectory()) {
        scanner.scandir(filePath, {
          fileAction: function(filePath, filename, next, stat) {
            allFiles.insert(toUrl(filePath));
            next();
          },
          next: function() {
            completedScans++;
            checkReady();
          }
        });
      } else { //!isDirectory
        allFiles.insert(urlPath);
        completedScans++;
        checkReady();
      }

      console.log('gonna watch ' + filePath);
      watchr.watch({
        path: filePath,
        listener: listener,
        next: function(err, watcher) {
          watchers.push(watcher);
          checkReady();
        },
        catchupDelay: 500
      });
    });
  }

  //Initialize the list of cache.manifest files
  for(var i = 0; i < paths.length; i++) {
    usePath(paths[i]);
  }

  function serveResponse(req, res) {
    //TODO: take a template of some kind? (nah, just read network/fallback/etc from opts
    res.set('Cache-Control', 'no-cache');
    res.set('Content-Type', 'text/cache-manifest');
    res.write('CACHE MANIFEST\n');
    //res.write('/json/lists.json\n');  //TODO: this
    for (var i = 0, len = allFiles.length; i < len; i++) {
      res.write(allFiles[i] + '\n');
    }
    res.write('\nNETWORK:\n*\n\n');
    //TODO: maybe just NETWORK block the JSON blobs instead of *?
    res.write('#Updated: ' + manifestVersion);
    res.end();
  }

  serveResponse['stop'] = function() {
    console.log('Stopping manifest generator filesystem watches');
    for (var i = 0; i < watchers.length; i++) {
      watchers[i].close();
    }
    watchers = [];
  };

  return serveResponse;
}

function nocache(req, res, next) {
  res.setHeader('Cache-Control', 'no-cache');
  next();
}

module.exports = {
  nocache: nocache,
  generator: serveManifest
};
