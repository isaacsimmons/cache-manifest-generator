'use strict';

var assert = require("assert");
var fs = require('fs');
var os = require('os');
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

//Function to expect a callback to be called one occurrence at a time
function callbackWatcher(defaultTimeout) {
  if (typeof defaultTimeout !== 'number') {
    defaultTimeout = 500;
  }
  var updateCallback = null;
  var currentMsg = null;

  function updateListener() {
    if (typeof updateCallback === 'function') {
      var tmp = updateCallback;
      updateCallback = null;
      currentMsg = null;
      tmp.apply(this, arguments);
    }
  }

  function waitForUpdate(msg, callback, timeout) {
    currentMsg = msg;
    var outtaTime = false;
    if (typeof timeout !== 'number') {
      timeout = defaultTimeout;
    }

    var timeoutId = setTimeout(function() {
      outtaTime = true;
      updateCallback = null;
      currentMsg = null;
      callback(new Error(msg));
    }, timeout);

    updateCallback = function() {
      clearTimeout(timeoutId);
      if (! outtaTime) {
        outtaTime = true; //TODO: rename this
        Array.prototype.splice.call(arguments, 0, 0, null);
        callback.apply(this, arguments);
      }
    };
  }

  return {
    listener: updateListener,
    wait: waitForUpdate
  };
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
      var filePath = INITIAL_FILES[i];
      fs.stat(filePath, function(err, stat) {
        count++;
        try {
          assert(err === null, 'Error getting fs stat');
          assert(stat.isFile(), 'Missing initial file');
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

describe('Initialization', function() {
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
          server.stop();
          if (err) { return done(err); }
          assert.deepEqual(manifest['NETWORK'], ['*'], 'Network section doesn\'t hold expected value'); //TODO: pull this from opts
          assert.deepEqual(manifest['CACHE'], INITIAL_URLS, 'Cache section doesn\'t hold expected value(s)');
          done();
        } catch (err) {
          done(err);
        }
      });
    }});
  });
});

describe('Observe Changes', function() {
  var newFile = 'test_files/some_files/new_dir/1.txt';
  var newUrl = '/some/new_dir/1.txt';

  function deleteTempFiles() {
    try {
      fs.statSync(path.dirname(newFile));
      try {
        fs.statSync(newFile);
        fs.unlinkSync(newFile);

      } catch (fileErr) {
        if (fileErr.code !== 'ENOENT') {
          throw fileErr;
        }
      }
      fs.rmdirSync(path.dirname(newFile));
    } catch (dirErr) {
      if (dirErr.code !== 'ENOENT') {
        throw dirErr;
      }
    }
  }

  before(deleteTempFiles);
  after(deleteTempFiles);

  var manifestWatcher = callbackWatcher(500);
  var fileWatcher = callbackWatcher(500);

  var server = null;
  beforeEach(function(done) {
    middleware.generator(CONFIG, {
      catchupDelay: 0,
      updateListener: manifestWatcher.listener,
      fileListener: fileWatcher.listener,
      readyCallback: function(s) {
        server = s;
        done();
      }
    });
  });

  afterEach(function() {
    assert(server !== null, 'Server shouldn\'t be null after test');
    server.stop();
    server = null;
  });

  it('Should observe modifications to watched files', function(done) {
    touch('test_files/hello.txt');
    manifestWatcher.wait('Timeout waiting for manifest update', function(err, manifest) {
      if (err) { done(err); }
      else { done(); }
    });
  });

  it('Should observe modifications to files in watched directories', function(done) {
    touch('test_files/some_files/a.txt');
    manifestWatcher.wait('Timeout waiting for manifest update', function(err, manifest) {
      if (err) { done(err); }
      else { done(); }
    });
  });

  it('Should observe modifications to files in subdirectories', function(done) {
    touch('test_files/some_files/nested/x.txt');
    manifestWatcher.wait('Timeout waiting for manifest update', function(err, manifest) {
      if (err) { done(err); }
      else { done(); }
    });
  });

  it('Should observe file creations and modifications to those new files', function(done) {
    try {
      fs.mkdirSync(path.dirname(newFile));
      fileWatcher.wait('Timeout waiting for directory create event', function(err, evt, evtPath) {
        if (err) { return done(err); }
        console.log('waited and got ' + evt + ', ' + evtPath);
        fs.writeFileSync(newFile, 'TEXT');
        manifestWatcher.wait('Timeout waiting for update after file creation', function(err, manifest) {
          if (err) { return done(err); }
          try {
            assert(manifest['CACHE'].indexOf(newUrl) !== -1, 'Newly created file should be in manifest');
            touch.sync(newFile);
            manifestWatcher.wait('Timeout waiting for update after file touch', function(err, manifest) {
              //TODO: this fails if the catchupDelay is set too high. Even after the create event has fired,
              //  watchr is still willing to swallow an adjacent update delete as belonging together
              //TODO: worse than that, it still seems to fail anyways sometimes when the filesystem doesn't have
              //  this folder cached or whatever. Some non-deterministic behavior
              if (err) { return done(err); }
              fs.unlinkSync(newFile);
              //Deleting a directory that is being watched in Windows crashes watchr!
              if (! os.platform().startsWith('win')) {
                fs.rmdirSync(path.dirname(newFile));
              }
              manifestWatcher.wait('Timeout waiting for update after file delete', function(err, manifest) {
                if (err) { return done(err); }
                try {
                  assert(manifest['CACHE'].indexOf(newUrl) === -1, 'Deleted file shouldn\'t be in manifest');
                  done();
                } catch (err) {
                  done(err);
                }
              });
            });
          } catch (err) {
            done(err);
          }
        });
      });
    } catch (err) {
      done(err);
    }
  });
});
