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
  fakeReq(server, function(header, body) {
    var manifest = {};
    var lines = body.split('\n');

    callback(lines); //TODO: return manifest instead
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

function getManifestComment(server, callback) {
  console.log('get comment!');
  fakeReq(server, function(headers, body) {
    body = body.split('\n');
    var commentLine = null;
    for(var i = 0; i < body.length; i--) {
      if (body[i].startsWith('#')) {
        assert.equal(commentLine, null, 'Multiple comment lines found in manifest');
        commentLine = body[i];
      }
    }
    assert.notEqual(commentLine, null, 'No comment found in manifest');
    callback(commentLine);
  });
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
  it('Should contain expected files', function() {
    for(var i = 0; i < INITIAL_FILES.length; i++) {
      var path = INITIAL_FILES[i];
      fs.stat(path, function(err, stat) {
        assert.equal(err, null, 'Error getting fs stat for ' + path);
        assert(stat.isFile(), 'Missing initial file ' + path);
      });
    }
  });
});

describe('Check initial data', function() {
  it('should contain expected elements', function (done) {
    middleware.generator(CONFIG, null, function(server) {
      getManifest(server, function(header, body){
        server.stop();
        done();
      });
    });
  });
});
