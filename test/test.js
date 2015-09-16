'use strict';

var assert = require("assert");
var fs = require('fs');
var path = require('path');
var touch = require('touch');
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

describe.skip('Initialization', function() {
  it('should initialize properly', function (done) {
    middleware.generator(CONFIG, { readyCallback: function(server) {
      server.stop();
      done();
    }});
  });

  it('Should contain expected elements', function (done) {
    middleware.generator(CONFIG, { readyCallback: function(server) {
      getManifest(server, function(err, manifest) {
        try {
          if (err) { throw err; }
          assert.deepEqual(manifest['NETWORK'], ['*'], 'Network section doesn\'t hold expected value'); //TODO: pull this from opts
          assert.deepEqual(manifest['CACHE'], INITIAL_URLS, 'Cache section doesn\'t hold expected value(s)');
          done();
        } catch (err) {
          done(err);
        } finally {
          server.stop();
        }
      });
    }});
  });

  it('Should contain expected elements when configured with absolute paths', function (done) {
    var absolutePaths = [];
    for (var i = 0; i < CONFIG.length; i++) {
      absolutePaths.push({
        file: path.resolve(process.cwd(), CONFIG[i]['file']),
        url: CONFIG[i]['url']
      });
    }

    middleware.generator(absolutePaths, { readyCallback: function(server) {
      getManifest(server, function(err, manifest) {
        try {
          if (err) { throw err; }
          assert.deepEqual(manifest['NETWORK'], ['*'], 'Network section doesn\'t hold expected value'); //TODO: pull this from opts
          assert.deepEqual(manifest['CACHE'], INITIAL_URLS, 'Cache section doesn\'t hold expected value(s)');
          done();
        } catch (err) {
          done(err);
        } finally {
          server.stop();
        }
      });
    }});
  });
});

describe('Observe Changes', function() {
  var newFile = 'test_files/some_files/new_dir/1.txt';
  var newUrl = '/some/new_dir/1.txt';


      it('Should observe modifications to initial files');

  //TODO: So many callbacks! Convert this to promises or something
  it('Should observe file creations and modifications to those new files', function(done) {
    console.log('test started');
    var updateCallback = null;
    function updateListener() {
      if (typeof updateCallback === 'function') {
        updateCallback();
        updateCallback = null;
      }
    }

    function waitForUpdate(timeout, callback) {
      var outtaTime = false;
      var timeoutId = setTimeout(function() {
        outtaTime = true;
        updateCallback = null;
        callback(new Error('Timeout waiting for update'));
      }, timeout);

      updateCallback = function() {
        if (! outtaTime) {
          clearTimeout(timeoutId);
          callback(null);
        }
      };
    }

    middleware.generator(CONFIG, { catchupDelay: 0, updateListener: updateListener, readyCallback: function(server) {
      console.log('server online');
      function cleanup(err) {
        console.log('bailing out');
        console.log(err);
        server.stop();
        done(err);
      }

      getManifest(server, function(err, manifest) {
        if (err) { return cleanup(err); }
        try {
          console.log('got the first manifest');
          var comments = manifest['COMMENTS'];
          console.log(comments);
          assert(comments.length > 0, 'Expected to find a comment in the manifest');
          var timestamp = comments[comments.length - 1];
          //add a file
          fs.mkdirSync(path.dirname(newFile));
          //It takes the watcher a second to start watching the nested folder and will not immediately notice new files in it
          setTimeout(function() {
            fs.writeFileSync(newFile, 'TEXT');
            //get the manifest
            waitForUpdate(500, function() {
              getManifest(server, function(err, manifest) {
                if (err) { return cleanup(err); }
                try {
                  console.log(JSON.stringify(manifest['CACHE']));
                  assert(manifest['CACHE'].indexOf(newUrl) !== -1, 'Newly created file should be in manifest');
                  var comments = manifest['COMMENTS'];
                  assert(comments.length > 0, 'Expected to find a comment in the manifest');
                  assert.notEqual(comments[comments.length - 1], timestamp, 'Expected timestamp to be updated');
                  console.log('YAY');
                  timestamp = comments[comments.length - 1];
                  server.stop();
                  done();
                } catch (err) {
                  cleanup(err);
                }
              });
            });
          }, 400);
          //wait another sec
          //touch that file
          //get the manifest
          //timestamp is updated
          //wait another sec
          //delete that file
          //file is not in the manifest
          //timestamp is updated
        } catch (err) {
          console.log('top level error');
          cleanup(err);
        }
      });
    }});
  });

  it('Should observe creations and deletions in newly nested directories');
});
