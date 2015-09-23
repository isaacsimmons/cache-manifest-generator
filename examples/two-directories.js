var express = require('express');
var manifest = require('..');
//If running from anywhere but the examples subdirectory of
// cache-manifest-generator, use the commented out require below instead`
//var manifest = require('cache-manifest-generator');

var app = express();

//Set Cache-Control: no-cache on all files served during development
app.use(function(req, res, next) {
  res.set('Cache-Control', 'no-cache');
  next();
});

app.get('/cache.manifest', manifest([
  { file: 'transpiler_output', url: '/js' },
  { file: 'site', url: '/', ignore: /\.template/ }
]));

app.use(express.static('site'));
app.use('/js', express.static('transpiler_output'));

app.listen(8000);

