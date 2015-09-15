'use strict';

var assert = require("assert");
var fs = require('fs');
var middleware = require('../index.js');

//Helper Functions
function fakeReq(server, callback) {
  var headers = [];
  var buf = [];

  server(null, {
    end: function(s) {
      if (typeof s === 'string') {
        buf.push(s);
      }
      callback(headers, buf.join(''));
    },
    write: function(s) {
      if (typeof s === 'string') {
        buf.push(s);
      }
    },
    set: function(name, value) {
      headers.push({name: name, value: value});
    }
  });
}

function getManifest(server, callback) {
  fakeReq(server, function(headers, body) {
    try {
      var i;
      var ccHeader = false;
      var ctHeader = false;
      for(i = 0; i < headers.length; i++) {
        var header = headers[i];
        if (header['name'] === 'Cache-Control') {
          assert.equal(header['value'], 'no-cache', 'Cache-Control header should be set to no-cache');
          ccHeader = true;
        } else if (header['name'] === 'Content-Type') {
          assert.equal(header['value'], 'text/cache-manifest', 'Content-Type header should be set to text/cache-manifest');
          ctHeader = true;
        }
      }
      assert(ccHeader, 'No Cache-Control header found');
      assert(ctHeader, 'No Content-Type header found');

      var manifest = { CACHE: [], COMMENT: [] };
      var lines = body.split('\n');
      assert.equal(lines[0], 'CACHE MANIFEST', 'First line of manifest should be CACHE MANIFEST');
      var section = 'CACHE';
      for (i = 1; i < lines.length; i++) {
        var line = lines[i];
        assert.equal(line.trim(), line, 'No extra whitespace expected on cache manifest lines');
        if (line.length === 0) {
          //Blank line
          section = null;
        } else if (line.startsWith('#')) {
          //Comment
          manifest['COMMENT'].push(line.substr(1));
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

      callback(null, manifest);
    } catch (err) {
      callback(err);
    }
  });
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

var CONFIG = [
  {
    file: 'test_files/some_files',
    url: 'some'
  },
  'test_files/more_files'
];

var INITIAL_FILES = [
  'test_files/some_files/a.txt',
  'test_files/some_files/b.txt',
  'test_files/some_files/nested/x.txt',
  'test_files/some_files/nested/y.txt',
  'test_files/more_files/1.txt',
  'test_files/more_files/2.txt'
];

var INITIAL_URLS = [
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
          console.log('CACHE is ' + JSON.stringify(manifest['CACHE']));
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
