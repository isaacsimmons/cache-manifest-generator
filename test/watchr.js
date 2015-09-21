var fs = require('fs');
var watchr = require('watchr');
var touch = require('touch');

var NEW_FILE = 'test_files/some_files/blah/a.txt';
var NEW_DIR = 'test_files/some_files/blah';
var BASE_DIR = 'test_files';

function listener(evt, evtPath) {
  console.log('Got ' + evt + ' event for ' + evtPath);
}

watchr.watch({
  path: BASE_DIR,
  listener: listener,
  next: function(err, watcher) {
    setTimeout(function() {
      watcher.close();
      fs.rmdirSync(NEW_DIR);
    }, 3000);

    fs.mkdirSync(NEW_DIR);

    setTimeout(function() {
      fs.writeFileSync(NEW_FILE);
      touch.sync(NEW_FILE);
    }, 500);

    //BLAAAHH. In it's effort to not display enitor temp file events, it swallows a lot of stuff

    setTimeout(function() {
      fs.unlinkSync(NEW_FILE);
    }, 1000);
  },
  catchupDelay: 0
});
