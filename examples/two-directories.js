var express = require('express');
var manifest = require('..');
//If running from anywhere but the examples subdirectory of
// cache-manifest-generator, use the commented out require below instead`
//var manifest = require('cache-manifest-generator');

var app = express();

app.set('view engine', 'jade');

//Set Cache-Control: no-cache on all files served during development
app.use(function(req, res, next) {
  res.set('Cache-Control', 'no-cache');
  next();
});

app.get('/cache.manifest', manifest([
  { file: 'transpiler_output', url: '/js', ignore: /.*test.js/ },
  { file: 'site', url: '/' },
  { file: 'views', match: /^(.*).jade/, rewrite: '/$1.html'}
 ]));

app.get('/index.html', function(req, res) {
  res.render('index.jade');
});

app.use(express.static('site'));
app.use('/js', express.static('transpiler_output'));

app.listen(8000);
