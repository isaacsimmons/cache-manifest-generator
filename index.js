'use strict';

//TODO: on initial scan, check for the latest timestamp so that re-initialization of the server doesn't needlessly bump the cache.manifest version?

var path    = require('path');
var fs      = require('fs');

var watchr  = require('watchr');
var scanner = require('scandirectory');  //TODO: look at other recursive scan options


//Helpers for dealing with sorted arrays
function locationOf(val, arr, start, end) {
  start = start || 0;
  end = end || arr.length;
  var pivot = parseInt(start + (end - start) / 2, 10);
  if (end - start <= 1 || arr[pivot] === val) return pivot;
  if (arr[pivot] < val) {
    return locationOf(val, arr, pivot, end);
  } else {
    return locationOf(val, arr, start, pivot);
  }
}

function insert(val, arr) {
  //TODO: prevent duplicate insertions?
  arr.splice(locationOf(val, arr) + 1, 0, val);
}

function remove(val, arr) {
  var index = arr.indexOf(val); //TODO: use locationOf here but guard against deleting non-present members?
  if (index > -1) {
    arr.splice(index, 1);
  }
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
  var allFiles = [];
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
      console.log('converting ' + orig);
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
            remove(url, allFiles);
          } else if (evt === 'create') {
            insert(url, allFiles);
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
            console.log('scanned file at ' + filePath);
            insert(toUrl(filePath), allFiles);
            next();
          },
          next: function() {
            completedScans++;
            checkReady();
          }
        });
      } else { //!isDirectory
        insert(urlPath, allFiles);
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
