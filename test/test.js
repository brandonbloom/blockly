var path = require('path');
var fs = require('fs');
var assert = require('chai').assert;
var jsdom = require('jsdom').jsdom;
var xmldom = require('xmldom');

var VENDOR_CODE =
  fs.readFileSync(path.join(__dirname, '../dist/js/vendor.js'));

var initBlockly = function(window_) {
  /* jshint -W054 */
  var fn = new Function(VENDOR_CODE + '; return Blockly;');
  return fn.call(window_);
};

// Initialize virtual browser environment.
var html = '<html><head></head><body><div id="app"></div></body></html>';
var document_ = global.document = jsdom(html);
var window_ = global.window = document_.parentWindow;
window_.DOMParser = global.DOMParser = xmldom.DOMParser;
window_.XMLSerializer = global.XMLSerializer = xmldom.XMLSerializer;
window_.Blockly = global.Blockly = initBlockly(window_);

var appGlobals = {
  maze: 'Maze',
  turtle: 'Turtle'
};

// Asynchronously test a level in side a virtual browser environment.
var runLevel = function(app, level, done) {
  require('../build/js/' + app + '/main');
  var main = window_[app + 'Main'];
  main({
    skinId: 'farmer', // XXX Doesn't apply to Turtle, should come from level.
    level: level,
    baseUrl: '/', // XXX Doesn't matter
    containerId: 'app',
    onInitialize: function() {
      // Fire the run button handler!
      window_[appGlobals[app]].runButtonClick();
    },
    onAttempt: function(report) {
      // Validate successful solution.
      assert(report.result, "Failed solution");
      done();
    }
  });

  //TODO: Validate that solutions match their puzzle's toolbox.
  //TODO: Create non-solution test cases too.
};

['maze', 'turtle'].forEach(function(app) {
  describe(app + ' levels', function() {

    var levels = require('../build/js/' + app + '/levels');
    Object.keys(levels).forEach(function(levelId) {

      var level = levels[levelId];
      var xmlPath = path.join(__dirname, 'solutions', app, levelId + '.xml');
      var description = 'level ' + levelId + ' solution';

      if (fs.existsSync(xmlPath)) {
        it(description, function(done) {

          // Warp Speed!
          if (!level.scale) {
            level.scale = {};
          }
          level.scale.stepSpeed = 0;

          // Override start blocks to load the solution;
          var xml = fs.readFileSync(xmlPath, 'utf8');
          level.startBlocks = xml;

          runLevel(app, level, done);

        });
      } else {
        // Treat missing solutions as pending, not failing.
        it(description);
      }

    });

  });
});
