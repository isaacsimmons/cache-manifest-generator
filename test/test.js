'use strict';

var CONFIG = {
  file: 'test'
};

var middleware = require('../index.js');

var lastTimestamp = null;

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


middleware.generator(CONFIG, function(server) {
  getManifestComment(server);
  server.stop();
});

