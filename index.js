'use strict';

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
  arr.splice(locationOf(val, arr) + 1, 0, val);
}

function remove(val, arr) {
  var index = arr.indexOf(val);
  if (index > -1) {
    arr.splice(index, 1);
  }
}

//Paths = array of paths to watch for changes
//Each path is an object with a "file" property and any of the following optional properties: url, ignore, recurse, rewrite


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

  function usePath(path) {
    if (! 'file' in path) {
      throw new Error('Path object must contain a "file" property');
    }
    var filePath = path['file'];
    var urlPath = path['url'] || path['file'];
    //TODO: prepend a / on urlPath if missing?

    function updateFileList(evt, filePath) {
      var s = filePath.split(path.sep);

      //TODO: this slice isn't sufficient if I start recursing on subdirectories
      var location = s.slice(0, -1).join('/');
      var filename = s[s.length - 1];
      //Convert file path to url path if we have a known mapping

      var url = '/' + urlPath + '/' + filename;
      if (evt === 'delete') {
        remove(url, allFiles);
      } else if (evt === 'create') {
        insert(url, allFiles);
      }
      manifestVersion = new Date().toISOString();
      console.log('cache updated');
    }

    fs.readdir(filePath, function (err, files) {
      //TODO: handle error here
      //TODO: what if I pass in files instead of directories?
      //TODO: recurse on subdirectories?
      //TODO: ignore patterns?
      for (var i = 0, len = files.length; i < len; i++) {
        var filename = files[i];
        if (filename[0] !== '.') {
          //translate filePath to urlPath before adding
          allFiles.push('/' + urlPath + '/' + filename);
        }
      }
      allFiles.sort();

      //Start watching those directories and files for changes
      watchr.watch({
        paths: [ filePath ],
        listener: function (evt, path) {
          if (evt === 'delete' || evt === 'create') {
            updateFileList(evt, path);
          } else if (evt === 'update') {
            console.log('cache updated');
            manifestVersion = new Date().toISOString();
          }
        },
        catchupDelay: 500
      });
      console.log('cache updated');
    });
  }

  //Initialize the list of cache.manifest files
  for(i = 0, len = paths.length; i < len; i++) {
    usePath(paths[i]);
  }

  return function(req, res) {
    //TODO: take a template of some kind?
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
