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
  var statusCode = null;

  function status(num) {
    statusCode = num;
    return mockResponse;
  }

  function write(s) {
    if (typeof s === 'string') {
      buf.push(s);
    }
  }

  function end(s) {
    write(s);
    var body = buf.join('');
    try {
      assert.equal(ccHeader, 'no-cache', 'Cache-Control header should be no-cache');
      assert.equal(ctHeader, 'text/cache-manifest', 'Content-Type header should be text/cache-manifest');
      var manifest = parseManifest(body);
      callback(null, manifest, statusCode);
    } catch(err) {
      callback(err, body, statusCode);
    }
  }

  function set(name, value) {
    if (name === 'Cache-Control') {
      ccHeader = value;
    } else if (name === 'Content-Type') {
      ctHeader = value;
    }
  }

  var mockResponse = {
    status: status,
    end: end,
    send: end,
    write: write,
    set: set
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
    var timedout = false;
    if (typeof timeout !== 'number') {
      timeout = defaultTimeout;
    }

    var timeoutId = setTimeout(function() {
      timedout = true;
      updateCallback = null;
      currentMsg = null;
      callback(new Error(msg));
    }, timeout);

    updateCallback = function() {
      clearTimeout(timeoutId);
      if (! timedout) {
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
    file: 'test/files/some_files',
    url: 'some'
  }, {
    file: 'test/files/more_files',
    url: 'files/more_files'
  }, {
    file: 'test/files/hello.txt',
    url: 'hello.txt'
  }
];

var INITIAL_FILES = [
  'test/files/hello.txt',
  'test/files/some_files/a.txt',
  'test/files/some_files/z.txt',
  'test/files/some_files/nested/x.txt',
  'test/files/some_files/nested/y.txt',
  'test/files/more_files/1.txt',
  'test/files/more_files/2.txt'
];

var INITIAL_URLS = [
  '/hello.txt',
  '/files/more_files/1.txt',
  '/files/more_files/2.txt',
  '/some/a.txt',
  '/some/z.txt',
  '/some/nested/x.txt',
  '/some/nested/y.txt'
];

//Tests
describe('Check filesystem', function() {
  it('Should contain expected initial test files', function(done) {
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
  var defaultNetworkConfig = ['*'];

  it('Should initialize properly', function (done) {
    middleware(CONFIG, { readyCallback: function(server) {
      server.stop();
      done();
    }});
  });

  it('Should contain expected elements', function (done) {
    var fallbackCOnfig = ['fallback1', 'fallback2'];

    middleware(CONFIG, { fallback: fallbackCOnfig, readyCallback: function(server) {
      getManifest(server, function(err, manifest) {
        server.stop();
        if (err) { return done(err); }
        try {
          assert.deepEqual(manifest['NETWORK'], defaultNetworkConfig, 'Network section doesn\'t hold expected default value');
          assert.deepEqual(manifest['FALLBACK'], fallbackCOnfig, 'Fallback section doesn\'t hold expected value');
          assert.deepEqual(manifest['CACHE'], INITIAL_URLS, 'Cache section doesn\'t hold expected values');
          done();
        } catch (err) {
          done(err);
        }
      });
    }});
  });

  it('Should not contain ignored files', function (done) {
    var configWithIgnores = [];
    for (var i = 0; i < CONFIG.length; i++) {
      configWithIgnores.push({
        file: CONFIG[i]['file'],
        url: CONFIG[i]['url'],
        ignore: /[x-z].txt/
      });
    }

    var filteredUrls = [
      '/hello.txt',
      '/files/more_files/1.txt',
      '/files/more_files/2.txt',
      '/some/a.txt'
    ];

    middleware(configWithIgnores, { readyCallback: function(server) {
      getManifest(server, function(err, manifest) {
        server.stop();
        if (err) { return done(err); }
        try {
          assert.deepEqual(manifest['NETWORK'], defaultNetworkConfig, 'Network section doesn\'t hold expected default value');
          assert(! ('FALLBACK' in manifest), 'Fallback section should be empty');
          assert.deepEqual(manifest['CACHE'], filteredUrls, 'Cache section doesn\'t hold expected values');
          done();
        } catch (err) {
          done(err);
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

    middleware(absolutePaths, { readyCallback: function(server) {
      getManifest(server, function(err, manifest) {
        try {
          server.stop();
          if (err) { return done(err); }
          assert.deepEqual(manifest['NETWORK'], defaultNetworkConfig, 'Network section doesn\'t hold expected value');
          assert.deepEqual(manifest['CACHE'], INITIAL_URLS, 'Cache section doesn\'t hold expected value(s)');
          done();
        } catch (err) {
          done(err);
        }
      });
    }});
  });

  it('Should stop responding once stopped', function (done) {
    middleware(CONFIG, { readyCallback: function(server) {
      server.stop();
      getManifest(server, function(err, manifest, status) {
        try {
          assert.equal(Math.floor(status / 100), 5, 'Response code should indicate server error after having been stopped');
          assert(typeof manifest === 'string', 'Error page shouldn\'t be valid manifest file');
          done();

        } catch (err) {
          done(err);
        }
      });
    }});
  });
});

describe('Observe Changes', function() {
  var newFile = 'test/files/some_files/new_dir/1.txt';
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
    middleware(CONFIG, {
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
    setTimeout(function() {  //Need to wait a second or the file modify time may be unchanged
      touch('test/files/hello.txt');
      manifestWatcher.wait('Timeout waiting for manifest update', function(err, manifest) {
        if (err) { done(err); }
        else { done(); }
      });
    }, 1000);
  });

  it('Should observe modifications to files in watched directories', function(done) {
    setTimeout(function() {  //Need to wait a second or the file modify time may be unchanged
      touch('test/files/some_files/a.txt');
      manifestWatcher.wait('Timeout waiting for manifest update', function(err, manifest) {
        if (err) { done(err); }
        else { done(); }
      });
    }, 1000);
  });

  it('Should observe modifications to files in watched subdirectories', function(done) {
    setTimeout(function() {  //Need to wait a second or the file modify time may be unchanged
      touch('test/files/some_files/nested/x.txt');
      manifestWatcher.wait('Timeout waiting for manifest update', function(err, manifest) {
        if (err) { done(err); }
        else { done(); }
      });
    }, 1000);
  });

  it('Should observe creations/modifications/deletions of files in newly created subdirectories', function(done) {
    try {
      fs.mkdirSync(path.dirname(newFile));
      fileWatcher.wait('Timeout waiting for directory create event', function(err, evt, evtPath) {
        if (err) { return done(err); }
        fs.writeFileSync(newFile, 'TEXT');
        manifestWatcher.wait('Timeout waiting for update after file creation', function(err, manifest) {
          if (err) { return done(err); }
          try {
            assert(manifest['CACHE'].indexOf(newUrl) !== -1, 'Newly created file should be in manifest');
            setTimeout(function() {  //Need to wait a second or the file modify time may be unchanged
              touch.sync(newFile);
              manifestWatcher.wait('Timeout waiting for update after file touch', function(err, manifest) {
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
            }, 1000);
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
