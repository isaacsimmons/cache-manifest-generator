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
  //TODO: local variables instead of leaving them in opts? less opportunity for weirdness if people swap things around?
  if (typeof opts['readyCallback'] !== 'function') {
    opts['readyCallback'] = function() {};
  }
  if (typeof opts['updateListener'] !== 'function') {
    opts['updateListener'] = function() {};
  }
  if (typeof opts['fileListener'] !== 'function') {
    opts['fileListener'] = function() {};
  }
  if (typeof opts['catchupDelay'] !== 'number') {
    opts['catchupDelay'] = 500;
  }

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
      opts['readyCallback'](serveResponse);
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
      if (! orig.startsWith(filePath)) {
        throw new Error('!!!!!!!!!!!!');
      }
      //console.log('converting ' + orig);
      var relPath = orig.substr(filePath.length);
      if (relPath.startsWith(path.sep)) {
        relPath = relPath.substr(path.sep.length);
      }
      //Convert to /'s for URL in case the filePath has \ separators
      return urlPath + '/' + path.posix.format(path.parse(relPath));
    }

    function listener(evt, evtPath) {
      if (evt === 'create') {
        fs.stat(evtPath, function(err, stat) {
          if (stat.isFile()) {
            var url = toUrl(evtPath);
            if (manifest['CACHE'].insert(url)) {
              if (stat.mtime > manifest['TIMESTAMP'] ) {
                manifest['TIMESTAMP'] = stat.mtime;
              }
              console.log('cache updated');
              opts['updateListener'](manifest);
            }
          } else if (stat.isDirectory()) {
            var anyAdded = false;
            //A file added too quickly after its directory is created can be skipped over, so we re-scan any newly
            //  added directories to catch those files
            scanner.scandir(evtPath, {
              fileAction: function(filePath, filename, next, stat) {
                if (manifest['CACHE'].insert(toUrl(filePath))) {
                  if (stat.mtime > manifest['TIMESTAMP'] ) {
                    manifest['TIMESTAMP'] = stat.mtime;
                  }
                  anyAdded = true;
                }
                next();
              },
              next: function() {
                if (anyAdded) {
                  console.log('cache updated');
                  opts['updateListener'](manifest);
                }
              }
            });
          }
        });
      } else if (evt === 'update') {
        fs.stat(evtPath, function(err, stat) {
          if (stat.isFile()) { //Might it ever not be?
            var url = toUrl(evtPath);
            manifest['CACHE'].insert(url);
            if (stat.mtime > manifest['TIMESTAMP'] ) {
              manifest['TIMESTAMP'] = stat.mtime;
            }
            console.log('cache updated');
            opts['updateListener'](manifest);
          }
        });
      } else if (evt === 'delete') {
        var url = toUrl(evtPath);
        if (manifest['CACHE'].remove(url)) {
          console.log('cache updated');
          opts['updateListener'](manifest);
        } else {
          //Probably a directory??
          //Maybe keep a list of directory names somewhere if I need them?
        }
      }
      opts['fileListener'](evt, evtPath);
    }

    fs.stat(filePath, function(err, stat) {
      if (err) { throw err; }
      if (stat.isDirectory()) {
        scanner.scandir(filePath, {
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
        manifest['CACHE'].insert(urlPath);
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
        catchupDelay: opts['catchupDelay']
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
