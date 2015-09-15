'use strict';

var assert = require("assert");
var fs = require('fs');
var path = require('path');
var middleware = require('../index.js');

//Helper Functions
function getManifest(server, callback) {
  var buf = [];
  var ccHeader = null;
  var ctHeader = null;

  var mockResponse = {
    end: function(s) {
      if (typeof s === 'string') {
        buf.push(s);
      }
      try {
        assert.equal(ccHeader, 'no-cache', 'Cache-Control header should be no-cache');
        assert.equal(ctHeader, 'text/cache-manifest', 'Content-Type header should be text/cache-manifest');
        var manifest = parseManifest(buf.join(''));
        callback(null, manifest);
      } catch(err) {
        callback(err);
      }
    },
    write: function(s) {
      if (typeof s === 'string') {
        buf.push(s);
      }
    },
    set: function(name, value) {
      if (name === 'Cache-Control') {
        ccHeader = value;
      } else if (name === 'Content-Type') {
        ctHeader = value;
      }
    }
  };

  server(null, mockResponse);
}

function parseManifest(body) {
  var manifest = { CACHE: [], COMMENTS: [] };
  var lines = body.split('\n');
  assert.equal(lines[0], 'CACHE MANIFEST', 'First line should be CACHE MANIFEST');
  var section = 'CACHE';
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i];
    assert.equal(line.trim(), line, 'No extra whitespace expected in cache manifest');
    if (line.length === 0) {
      //Blank line
      section = null;
    } else if (line.startsWith('#')) {
      //Comment
      manifest['COMMENTS'].push(line.substr(1));
    } else if (section === null) {
      //New section header
      assert(line.endsWith(':'), 'Cache section lines should end with :');
      section = line.substr(0, line.length - 1);
      if (section !== 'CACHE') {
        assert(!(section in manifest), 'Multiple copies of section header ' + section + ' found in manifest');
        manifest[section] = [];
      }
    } else {
      //Inside of an existing section
      manifest[section].push(line);
    }
  }

  assert.deepEqual(manifest['CACHE'].slice().sort(), manifest['CACHE'], 'Cache entries should be soted');

  return manifest;
}

function addFile(path) {

}

function touchFile(path) {

}

function delFile(path) {

}

function addDir(path) {

}

function rmDir(path) {

}

function assertInManifest(server, line) {

}

function assertManifestChanged(server) {

}

function assertManifestNotChanged(server) {

}

var CONFIG = [{
    file: 'test_files/some_files',
    url: 'some'
  }, {
    file: 'test_files/more_files',
    url: 'test_files/more_files'
  }, {
    file: 'test_files/hello.txt',
    url: 'hello.txt'
  }
];

var INITIAL_FILES = [
  'test_files/hello.txt',
  'test_files/some_files/a.txt',
  'test_files/some_files/b.txt',
  'test_files/some_files/nested/x.txt',
  'test_files/some_files/nested/y.txt',
  'test_files/more_files/1.txt',
  'test_files/more_files/2.txt'
];

var INITIAL_URLS = [
  '/hello.txt',
  '/some/a.txt',
  '/some/b.txt',
  '/some/nested/x.txt',
  '/some/nested/y.txt',
  '/test_files/more_files/1.txt',
  '/test_files/more_files/2.txt'
];

//Tests
describe('Init', function() {
  it('should initialize properly', function (done) {
    middleware.generator(CONFIG, null, function(server) {
      server.stop();
      done();
    });
  });
});

describe('Check filesystem', function() {
  it('Should contain expected files', function(done) {
    var count = 0;
    for(var i = 0; i < INITIAL_FILES.length; i++) {
      var path = INITIAL_FILES[i];
      fs.stat(path, function(err, stat) {
        count++;
        try {
          assert.equal(err, null, 'Error getting fs stat for ' + path);
          assert(stat.isFile(), 'Missing initial file ' + path);
          if (count === INITIAL_FILES.length) {
            done();
          }
        } catch(err) {
          done(err);
        }
      });
    }
  });
});

describe('Check initial data', function() {
  it('Should contain expected elements', function (done) {
    middleware.generator(CONFIG, null, function(server) {
      getManifest(server, function(err, manifest) {
        if (err) {
          done(err);
          server.stop();
          return;
        }
        try {
          assert.deepEqual(manifest['NETWORK'], ['*'], 'Network section doesn\'t hold expected value'); //TODO: pull this from opts
          assert.deepEqual(manifest['CACHE'], INITIAL_URLS, 'Cache section doesn\'t hold expected value(s)');
          done();
        } catch (err) {
          done(err);
        } finally {
          server.stop();
        }
      });
    });
  });

  it('Should contain expected elements with absolute paths', function (done) {
    var absolutePaths = [];
    for (var i = 0; i < CONFIG.length; i++) {
      absolutePaths.push({
        file: path.resolve(process.cwd(), CONFIG[i]['file']),
        url: CONFIG[i]['url']
      });
    }

    middleware.generator(absolutePaths, null, function(server) {
      getManifest(server, function(err, manifest) {
        if (err) {
          done(err);
          server.stop();
          return;
        }
        try {
          assert.deepEqual(manifest['NETWORK'], ['*'], 'Network section doesn\'t hold expected value'); //TODO: pull this from opts
          assert.deepEqual(manifest['CACHE'], INITIAL_URLS, 'Cache section doesn\'t hold expected value(s)');
          done();
        } catch (err) {
          done(err);
        } finally {
          server.stop();
        }
      });
    });
  });
});

//TODO: observe changes to newly created files

//TODO: notice files added to newly created nested directories

//TODO: observe file additions and modifications to those new files

//TODO: notice file deletions

//folder deletions!