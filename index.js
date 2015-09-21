'use strict';

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
      return true;
    }
    return false;
  };

  arr.remove = function(val) {
    var index = indexOf(val);
    if (index >= 0 && arr[index] === val) {
      arr.splice(index, 1);
      return true;
    }
    return false;
  };

  return arr;
}

//Paths = array of paths to watch for changes
//Each path is an object with a "file" property and any of the following optional properties: url, ignore, recurse, rewrite
//Last argument can optionally be an "options" object
function serveManifest(paths, opts) {
  if (! Array.isArray(paths)) {
    throw new Error('First argument must be array of paths to watch');
  }
  if (paths.length === 0) {
    throw new Error('Must provide at least one path to watch');
  }
  if (! opts) {
    opts = {};
  }

  var readyCallback = typeof opts['readyCallback'] === 'function' ? opts['readyCallback'] : function() {};
  var updateListener = typeof opts['updateListener'] === 'function' ? opts['updateListener'] : function() {};
  var fileListener = typeof opts['fileListener'] === 'function' ? opts['fileListener'] : function() {};
  var catchupDelay = typeof opts['catchupDelay'] === 'number' ? opts['catchupDelay'] : 500;

  var manifest = {
    CACHE: sortedSet(),
    NETWORK: [],
    FALLBACK: [],
    TIMESTAMP: new Date(0)
  };

  var watchers = [];
  var completedScans = 0;

  function checkReady() {
    if (completedScans === paths.length && watchers.length === paths.length) {
      readyCallback(serveResponse);
    }
  }

  function usePath(p) {
    if (typeof p === 'string') {
      p = { file: p, url: p };
    }
    if (! ('file' in p)) {
      throw new Error('Path object must contain a "file" property');
    }
    var baseFilePath = p['file'];
    var baseUrlPath = p['url'] || p['file'];
    if (! baseUrlPath.startsWith('/')) {  //Make sure URL starts with /
      baseUrlPath = '/' + baseUrlPath;
    }
    baseFilePath = path.format(path.parse(baseFilePath)); //Make sure filePath uses OS native separators

    function toUrl(filePath) {
      var relPath = filePath.substr(baseFilePath.length);
      if (relPath.startsWith(path.sep)) {
        relPath = relPath.substr(path.sep.length);
      }
      //Convert to /'s for URL in case the filePath has \ separators
      return baseUrlPath + '/' + path.posix.format(path.parse(relPath));
    }

    function onFile(filePath, stat) {
      var newTimestamp = false;
      if (stat.mtime > manifest['TIMESTAMP'] ) {
        manifest['TIMESTAMP'] = stat.mtime;
        newTimestamp = true;
      }

      if (manifest['CACHE'].insert(toUrl(filePath)) || newTimestamp) {
        console.log('cache updated');
        updateListener(manifest);
      }
    }

    function listener(evt, evtPath) {
      if (evt === 'create' || evt === 'update') {
        fs.stat(evtPath, function(err, stat) {
          if (stat.isFile()) {
            onFile(evtPath, stat);
          } else if (stat.isDirectory() && evt === 'create') { //Do we even get "update" events for directories?
            //A file added too quickly after its directory is created can be skipped over, so we re-scan any newly
            //  added directories to catch those files
            scanner.scandir(evtPath, {
              fileAction: function(filePath, filename, next, stat) {
                onFile(filePath, stat);
                next();
              }
            });
          }
        });
      } else if (evt === 'delete') {
        if (manifest['CACHE'].remove(toUrl(evtPath))) {
          console.log('cache updated');
          updateListener(manifest);
        }
      }
      fileListener(evt, evtPath);
    }

    fs.stat(baseFilePath, function(err, stat) {
      if (err) { throw err; }
      if (stat.isDirectory()) {
        scanner.scandir(baseFilePath, {
          fileAction: function(filePath, filename, next, stat) {
            manifest['CACHE'].insert(toUrl(filePath));
            if (stat.mtime > manifest['TIMESTAMP'] ) {
              manifest['TIMESTAMP'] = stat.mtime;
            }
            next();
          },
          next: function() {
            completedScans++;
            checkReady();
          }
        });
      } else if (stat.isFile()) {
        if (stat.mtime > manifest['TIMESTAMP'] ) {
          manifest['TIMESTAMP']  = stat.mtime;
        }
        manifest['CACHE'].insert(baseUrlPath);
        completedScans++;
        checkReady();
      }

      console.log('gonna watch ' + baseFilePath);
      watchr.watch({
        path: baseFilePath,
        listener: listener,
        next: function(err, watcher) {
          watchers.push(watcher);
          checkReady();
        },
        catchupDelay: catchupDelay
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
    for (var i = 0, len = manifest['CACHE'].length; i < len; i++) {
      res.write(manifest['CACHE'][i] + '\n');
    }
    res.write('\nNETWORK:\n*\n\n');
    //TODO: NETWORK and FALLBACK based on vars

    //Drop milliseconds since filesystem mtimes only report second accuracy
    var timeString = manifest['TIMESTAMP'].toISOString();
    timeString = timeString.substring(0, timeString.length - 5) + 'Z';
    res.write('#Updated: ' + timeString);
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
