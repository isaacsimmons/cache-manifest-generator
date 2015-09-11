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
function serveManifest() {
  var i, len;

  //Parse arguments, apply defaults
  var paths = [];
  var opts = {};

  for(i = 0, len = arguments.length; i < len; i++) {
    var arg = arguments[i];
    if (typeof arg === 'string') {
      arg = { file: arg, url: arg };
    }

    if (i === (len - 1) && !'file' in arg) {
      opts = arg;
    } else {
      paths.push(arg);
    }
  }

  var allFiles = [];
  var manifestVersion = new Date().toISOString();

  function usePath(p) {
    if (! 'file' in p) {
      throw new Error('Path object must contain a "file" property');
    }
    var filePath = p['file'];
    var urlPath = p['url'] || p['file'];

    filePath = path.format(path.parse(filePath));
    //TODO: prepend a / on urlPath if missing?
    //TODO: maybe turn all paths into absolute ones?

    function toUrl(orig) {
      console.log('converting ' + orig);
      var relPath = orig.substr(filePath.length);
      if (relPath.startsWith(path.sep)) {
        relPath = relPath.substr(path.sep.length);
      }
      return '/' + urlPath + '/' + path.posix.format(path.parse(relPath));
      //TODO: need to convert to /'s for URL
      //return '/' +  urlPath + '/' + orig.substr(filePath.length);
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
          }
        });
      } else { //!isDirectory
        insert(urlPath, allFiles);
      }

      console.log('gonna watch ' + filePath);
      watchr.watch({
        path: filePath,
        listener: listener,
        catchupDelay: 500  //TODO: pass in my stat object for re-use?
      });
    });

    //
    //  //Start watching those directories and files for changes
    //  watchr.watch({
    //    path: filePath,
    //    listener: listener,
    //    catchupDelay: 500
    //  });
    //  console.log('cache updated');
    //});
  }

  //Initialize the list of cache.manifest files
  for(i = 0, len = paths.length; i < len; i++) {
    usePath(paths[i]);
  }

  return function(req, res) {
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
}

function nocache(req, res, next) {
  res.setHeader('Cache-Control', 'no-cache');
  next();
}

module.exports = {
  nocache: nocache,
  generator: serveManifest
};
