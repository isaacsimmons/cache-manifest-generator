'use strict';

var path    = require('path');
var fs      = require('fs');

var watchr  = require('watchr');
var scanner = require('scandirectory');

function sortedSet() {
  var arr = [];

  function compare(p1, p2) {
    var d1 = path.dirname(p1);
    var d2 = path.dirname(p2);
    if (d1 !== d2) {
      return d1 < d2;
    }
    return p1 < p2;
  }

  function indexOf(val) {
    var min = 0, max = arr.length - 1;
    while (min <= max) {
      var cur = (min + max) / 2 | 0;
      if (compare(arr[cur], val)) {
        min = cur + 1;
      } else if (arr[cur] === val) {
        return cur;
      } else {
        max = cur - 1;
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

  arr.insertAll = function(vals) {
    for (var i = 0; i < vals.length; i++) {
      arr.insert(vals[i]);
    }
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

module.exports = function (paths, config) {
  if (! Array.isArray(paths)) { throw new Error('First argument must be array of paths to watch'); }
  if (paths.length === 0) { throw new Error('Must provide at least one path to watch'); }
  if (! config) { config = {}; }

  var readyCallback = typeof config['readyCallback'] === 'function' ? config['readyCallback'] : function() {};
  var updateListener = typeof config['updateListener'] === 'function' ? config['updateListener'] : function() {};
  var fileListener = typeof config['fileListener'] === 'function' ? config['fileListener'] : function() {};
  var catchupDelay = typeof config['catchupDelay'] === 'number' ? config['catchupDelay'] : 500;

  var manifest = {
    CACHE: sortedSet(),
    NETWORK: Array.isArray(config['network']) ? config['network'].slice() : ['*'],
    FALLBACK: Array.isArray(config['fallback']) ? config['fallback'].slice() : [],
    TIMESTAMP: null
  };

  var permanentCache = Array.isArray(config['cache']) ? config['cache'].slice().sort() : [];
  manifest['CACHE'].insertAll(permanentCache);

  function updateTimestamp(date) {
    if (date > manifest['TIMESTAMP']) {
      manifest['TIMESTAMP'] = date;
      return true;
    }
    return false;
  }

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
    baseFilePath = path.format(path.parse(baseFilePath)); //Make sure filePath uses OS native separators

    var baseUrlPath;
    if (typeof p['url'] === 'string') {
      baseUrlPath = p['url'] || p['file']
    } else if (! path.isAbsolute(p['file'])) {
      baseUrlPath = p['file'];
    } else {
      throw new Error('URL must be specified when an absolute file path is given: ' + p['file']);
    }

    //Make sure URL starts with /  but doesn't contain a trailing /
    if (! baseUrlPath.startsWith('/')) {
      baseUrlPath = '/' + baseUrlPath;
    }
    if (baseUrlPath.endsWith('/')) {
      baseUrlPath = baseUrlPath.substring(0, baseUrlPath.length - 1);
    }

    var ignore = p['ignore'] instanceof RegExp ? p['ignore'] : /$./;  //If no ignore pattern is given, use one that matches nothing

    function toUrl(filePath) {
      var relPath = filePath.substr(baseFilePath.length);
      if (relPath.startsWith(path.sep)) {
        relPath = relPath.substr(path.sep.length);
      }
      //Convert to /'s for URL in case the filePath has \ separators
      return baseUrlPath + '/' + path.posix.format(path.parse(relPath));
    }

    function onFile(filePath, stat) {
      if (filePath.match(ignore)) { return; }
      var newTimestamp = updateTimestamp(stat.mtime);
      if (manifest['CACHE'].insert(toUrl(filePath)) || newTimestamp) {
        updateListener(manifest);
      }
    }

    function listener(evt, evtPath) {
      if (evtPath.match(ignore)) { return; }
      if (evt === 'create' || evt === 'update') {
        fs.stat(evtPath, function(err, stat) {
          if (err) { console.error(err); return; }
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
        var url = toUrl(evtPath);
        if (permanentCache.indexOf(url) === -1) {
          if (manifest['CACHE'].remove(url)) {
            updateListener(manifest);
          }
        }
      }
      fileListener(evt, evtPath);
    }

    fs.stat(baseFilePath, function(err, stat) {
      if (err) { throw err; }
      if (stat.isDirectory()) {
        scanner.scandir(baseFilePath, {
          fileAction: function(filePath, filename, next, stat) {
            if (! filePath.match(ignore)) {
              manifest['CACHE'].insert(toUrl(filePath));
              updateTimestamp(stat.mtime);
            }
            next();
          },
          next: function() {
            completedScans++;
            checkReady();
          }
        });
      } else if (stat.isFile()) {
        if (baseFilePath.match(ignore)) {
          console.warn('Path ' + baseFilePath + ' points to a single file, but it is ignored by the pattern ' + ignore);
        } else {
          updateTimestamp(stat.mtime);
          manifest['CACHE'].insert(baseUrlPath);
        }
        completedScans++;
        checkReady();
      }

      watchr.watch({
        path: baseFilePath,
        listener: listener,
        next: function(err, watcher) {
          if (err) { throw err; }
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
    if (manifest === null) {
      res.status(500).send('Manifest generator offline');
      return;
    }
    res.set('Cache-Control', 'no-cache');
    res.set('Content-Type', 'text/cache-manifest');
    res.write('CACHE MANIFEST\n');
    for (var i = 0, len = manifest['CACHE'].length; i < len; i++) {
      res.write(manifest['CACHE'][i] + '\n');
    }
    if (manifest['NETWORK'].length > 0) {
      res.write('\nNETWORK:\n' + manifest['NETWORK'].join('\n') + '\n');
    }
    if (manifest['FALLBACK'].length > 0) {
      res.write('\nFALLBACK:\n' + manifest['FALLBACK'].join('\n') + '\n');
    }
    if (manifest['TIMESTAMP'] !== null) {
      //Drop millisecond accuracy since filesystem mtimes only report second accuracy
      var timeString = manifest['TIMESTAMP'].toISOString();
      timeString = timeString.substring(0, timeString.length - 5) + 'Z';
      res.write('\n#Updated: ' + timeString + '\n');
    }
    res.end();
  }

  serveResponse['stop'] = function() {
    for (var i = 0; i < watchers.length; i++) {
      watchers[i].close();
    }
    watchers = null;
    manifest = null;
    readyCallback = null;
    updateListener = null;
    fileListener = null;
  };

  return serveResponse;
};
