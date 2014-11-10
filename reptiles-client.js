(function() {
  if (typeof module !== 'undefined') {
    module.exports = reptile;
    clues = require('clues');
    request = require('request');
  } else {
    self.reptile = reptile;
  }

  var Promise = clues.prototype.Promise;

  function reptile(api,inputs,options) {
    if (!(this instanceof reptile))
      return new reptile(api,inputs,options);

    options = options || {};
    inputs = inputs || {};

    options.fallback = this.external;
    this.inputs = inputs;
    this.url = options.url || '/api/';
    this.queue = {};
    this.data = Object.create(this.inputs);
    this.fetcher = undefined;
    clues.call(this,api,Object.create(inputs),options);
  }

  reptile.prototype = Object.create(clues.prototype);

  reptile.prototype.fetch = function() {
    var self = this;

    self.fetcher = self.fetcher || Promise.delay(self.options.delay)
      .then(function() { new Promise(function(resolve,reject) {
        self.fetcher = undefined;
        if (!Object.keys(self.queue).length) return resolve(true);
        var queue = self.queue;
        self.queue = {};
              
        function processBuffer(text) {
          buffer += text;
          var items = buffer.split(',\t\n');
          buffer = items.slice(items.length-1);

          items.slice(0,items.length-1)
            .forEach(function(item) {
              var m = /\"(.*)\" \: (.*)/.exec(item);
              if (m) {
                var key = m[1];
                var value = JSON.parse(m[2]);
                if (!queue[key]) return;
                if (value && value.error)
                  queue[key].reject(value);
                else
                  queue[key].resolve(value);
                if (self.options.applyFn) self.options.applyFn();
              }
            });
        }

        if (typeof module == 'undefined') {
          // In browser we use XMLHttpRequest
          var r = new XMLHttpRequest();
          var buffer = '',last = 0;
          r.open('POST',self.url+Object.keys(queue),true);
          r.setRequestHeader('Content-Type','application/json;charset=UTF-8');
          r.send(JSON.stringify(self.inputs));
          r.onprogress = function() {
            buffer += r.responseText.slice(last);
            processBuffer(r.responseText.slice(last));
            last = r.responseText.length;
          };
          r.onload =  function() {
            processBuffer(r.responseText.slice(last));
            resolve(true);
          };
        } else {
          // In node.js we use request.js
          var options = Object.create(self.options.request || {});
          options.url = self.url+Object.keys(queue);
          options.method = options.method || 'POST';
          options.json = self.inputs;
          request(options)
            .on('data',function(d) {
              processBuffer(d);
            })
            .on('error',function(e) {
              Object.keys(queue)
                .forEach(function(d) {
                  queue[d].reject(e);
                });
              resolve(true);
            })
            .on('end',function() {
              resolve(true);
            });
        }
        });
    });
  
    return self.fetcher;
  };

  reptile.prototype.external = function(ref) {
    if (this.facts[ref]) return this.facts[ref];
    var result = this.queue[ref] = this.queue[ref] || Promise.defer();
    this.fetch();
    return result.promise;
  };

  reptile.prototype.render = function(element) {
    var self = this;
    var keys = element.dataset.reptile.split(','),key;

    function renderKey() {
      key = keys.shift();
      if (!self.logic[key]) throw 'not found '+key;
      return self.solve(self.logic[key],{element:element})
        .catch(renderKey);
    }
    return renderKey();
  };

  reptile.prototype.renderAll = function(element) {
    var self = this;
    if (!element && !window) throw 'Not in a browser - element must be provided';
    var selection = (element || window.document).querySelectorAll('[data-reptile]'),
        items = [].map.call(selection,function(d) {
          return self.render(d);
        });
    return Promise.settle(items);
  };

})();