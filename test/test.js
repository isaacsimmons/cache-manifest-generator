'use strict';

var assert = require("assert");
var middleware = require('../index.js');

var CONFIG = {
  file: 'test'
};

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

function getManifestComment(server) {
  console.log('get comment!');
  fakeReq(server, function(headers, body) {
    console.log(body.split('\n'));
  });
}



function assertManifestChanged(server) {

}

function assertManifestNotChanged(server) {

}

//Tests
describe('Initial Scan', function() {
  it('should initialize properly', function (done) {
    middleware.generator(CONFIG, function(server) {
      //getManifestComment(server);
      server.stop();
      done();
    });
  });
});
