'use strict';

var path   = require('path');
var fs     = require('fs');

var watchr = require('watchr');

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

function serveManifest(paths) {
  //TODO: get rid of my hardcoded paths in here
  //TODO: if paths is an array, transform it into an object
  //TODO: if paths is a string, transform it into an array

  var allFiles = [];
  var manifestVersion = new Date().toISOString();
  var pendingScans = 0;

  function updateFileList(evt, filePath) {
    var s = filePath.split(path.sep);
    var location = s.slice(0, -1).join('/');
    var filename = s[s.length - 1];
    //Convert file path to url path if we have a known mapping
    if (location in paths) {
      location = paths[location];
    }

    var urlPath = '/' + location + '/' + filename;
    if (evt === 'delete') {
      sortedArray.remove(urlPath, allFiles);
    } else if (evt === 'create') {
      sortedArray.insert(urlPath, allFiles);
    }
    manifestVersion = new Date().toISOString();
    console.log('cache updated');
  }

  function scanFiles(dir) {
    pendingScans++;
    fs.readdir(dir, function (err, files) {
      //TODO: handle error here
      //TODO: what if I pass in files instead of directories?
      pendingScans--;
      for (var i = 0, len = files.length; i < len; i++) {
        var filename = files[i];
        if (filename[0] !== '.') {
          //translate local relative path to url path before adding
          allFiles.push('/' + paths[dir] + '/' + filename);
        }
      }
      if (pendingScans <= 0) {
        allFiles.sort();

        //Start watching those directories and files for changes
        watchr.watch({
          paths: ['js', 'site/css', 'site/html', 'site/img'], //TODO: add lists.json to this if we decide to include it in the manifest
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
      }
    });
  }

  //Initialize the list of cache.manifest files
  scanFiles('site/css');
  scanFiles('site/html');
  scanFiles('site/img');
  scanFiles('js');

  return function(req, res) {
    //TODO: a method to write this to disk somewhere for when not using the dev server?
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

module.exports = {
  nocache: function (req, res, next){
    res.setHeader('Cache-Control', 'no-cache');
    next();
  },
  serveManifest: serveManifest
};
