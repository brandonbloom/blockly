/**
 * Blockly Demo: Turtle Graphics
 *
 * Copyright 2012 Google Inc.
 * http://blockly.googlecode.com/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Demonstration of Blockly: Turtle Graphics.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

window.Turtle = module.exports;

/**
 * Create a namespace for the application.
 */
var BlocklyApps = require('../base');
var Turtle = module.exports;
var Slider = require('../slider');
var msg = require('../../en_us/i18n/turtle');
var levels = require('./levels');
var Colours = require('./core').Colours;
var codegen = require('../codegen');
var api = require('./api');
var page = require('../page.html');

var level;

BlocklyApps.CHECK_FOR_EMPTY_BLOCKS = false;
BlocklyApps.NUM_REQUIRED_BLOCKS_TO_FLAG = 1;
BlocklyApps.FREE_BLOCKS = 'colour';

Turtle.HEIGHT = 400;
Turtle.WIDTH = 400;

/**
 * PID of animation task currently executing.
 */
Turtle.pid = 0;

/**
 * Colours used in current animation, represented as hex strings
 * (e.g., "#a0b0c0").
 */
Turtle.coloursUsed = [];

/**
 * Should the turtle be drawn?
 */
Turtle.visible = true;

/**
 * Initialize Blockly and the turtle.  Called on page load.
 */
Turtle.init = function(config) {

  level = config.level;

  BlocklyApps.IDEAL_BLOCK_NUM = level.ideal || Infinity;
  BlocklyApps.REQUIRED_BLOCKS = level.requiredBlocks || [];

  var html = page({
    baseUrl: config.baseUrl,
    data: {
      appInstance: 'Turtle',
      appFeedback: require('./appFeedback.html')(),
      controls: require('./controls.html')({baseUrl: config.baseUrl})
    }
  });
  document.getElementById(config.containerId).innerHTML = html;

  BlocklyApps.init(config);

  var div = document.getElementById('blockly');
  BlocklyApps.inject(div, {
    toolbox: level.toolbox
  });

  // Add to reserved word list: API, local variables in execution evironment
  // (execute) and the infinite loop detection function.
  Blockly.JavaScript.addReservedWords('Turtle,code');

  var blocklyDiv = document.getElementById('blockly');
  var visualization = document.getElementById('visualization');
  var onresize = function(e) {
    var top = visualization.offsetTop;
    blocklyDiv.style.top = top + 'px';

    var blocklyDivParent = blocklyDiv.parentNode;
    var parentStyle = window.getComputedStyle ?
                      window.getComputedStyle(blocklyDivParent) :
                      blocklyDivParent.currentStyle.width;  // IE
    var parentWidth = parseInt(parentStyle.width, 10);

    blocklyDiv.style.width = (parentWidth - 440) + 'px';
    blocklyDiv.style.height = (window.innerHeight - top - 20 +
        window.pageYOffset) + 'px';
  };
  window.addEventListener('scroll', function() {
      onresize();
      Blockly.fireUiEvent(window, 'resize');
    });
  window.addEventListener('resize', onresize);
  onresize();
  Blockly.fireUiEvent(window, 'resize');

  // Show the instructions.
  var instructions = config.level.instructions || '';
  document.getElementById('prompt').innerHTML = instructions;

  // Initialize the slider.
  var sliderSvg = document.getElementById('slider');
  Turtle.speedSlider = new Slider(10, 35, 130, sliderSvg);

  // Add the starting block(s).
  // If config.level.startBlocks is passed in, it overrides level.startBlocks
  BlocklyApps.loadBlocks(level.startBlocks);

  // Helper for creating canvas elements.
  var createCanvas = function() {
    var el = document.createElement("canvas");
    el.width = 400;
    el.height = 400;
    return el;
  };

  // Create hidden canvases.
  Turtle.ctxAnswer = createCanvas('answer').getContext('2d');
  Turtle.ctxImages = createCanvas('images').getContext('2d');
  Turtle.ctxScratch = createCanvas('scratch').getContext('2d');

  // Create display canvas.
  var display = createCanvas();
  display.id = 'display'; // for styles
  visualization.appendChild(display);
  Turtle.ctxDisplay = display.getContext('2d');

  // Fill canvases.
  Turtle.drawImages();
  Turtle.drawAnswer();
  BlocklyApps.reset();

  // Change default speed (eg Speed up levels that have lots of steps).
  if (level.sliderSpeed) {
    Turtle.speedSlider.setValue(level.sliderSpeed);
  }

  // Add display of blocks used unless free play.
  if (!level.freePlay) {
    Blockly.addChangeListener(function() {
      Turtle.updateBlockCount();
    });
  }
};

/**
 * Add count of blocks used, not counting colour blocks.
 */
Turtle.updateBlockCount = function() {
  BlocklyApps.setTextForElement(
      'blockCount',
      msg.blocksUsed().replace('%1', BlocklyApps.getNumBlocksUsed()));
};

/**
 * On startup draw the expected answer and save it to the answer canvas.
 */
Turtle.drawAnswer = function() {
  BlocklyApps.log = level.answer;
  BlocklyApps.reset();
  while (BlocklyApps.log.length) {
    var tuple = BlocklyApps.log.shift();
    Turtle.step(tuple[0], tuple.splice(1));
  }
  Turtle.ctxAnswer.globalCompositeOperation = 'copy';
  Turtle.ctxAnswer.drawImage(Turtle.ctxScratch.canvas, 0, 0);
  Turtle.ctxAnswer.globalCompositeOperation = 'source-over';
};

/**
 * Place an image at the specified coordinates.
 * Code from http://stackoverflow.com/questions/5495952. Thanks, Phrogz.
 * @param {string} filename Relative path to image.
 * @param {!Array} position An x-y pair.
 */
Turtle.placeImage = function(filename, position) {
  var img = new Image();
  img.onload = function() {
    Turtle.ctxImages.drawImage(img, position[0], position[1]);
    Turtle.display();
  };
  img.src = BlocklyApps.BASE_URL + 'media/turtle/' + filename;
};

/**
 * Draw the images for this page and level onto Turtle.ctxImages.
 */
Turtle.drawImages = function() {
  if (!level.images) {
    return;
  }
  for (var i = 0; i < level.images.length; i++) {
    var image = level.images[i];
    Turtle.placeImage(image.filename, image.position);
  }
  Turtle.ctxImages.globalCompositeOperation = 'copy';
  Turtle.ctxImages.drawImage(Turtle.ctxScratch.canvas, 0, 0);
  Turtle.ctxImages.globalCompositeOperation = 'source-over';
};

/**
 * Reset the turtle to the start position, clear the display, and kill any
 * pending tasks.
 * @param {boolean} ignore Required by the API but ignored by this
 *     implementation.
 */
BlocklyApps.reset = function(ignore) {
  // Standard starting location and heading of the turtle.
  Turtle.x = Turtle.HEIGHT / 2;
  Turtle.y = Turtle.WIDTH / 2;
  Turtle.heading = 0;
  Turtle.penDownValue = true;
  Turtle.visible = true;

  // For special cases, use a different initial location.
  if (level.initialX) {
    Turtle.x = level.initialX;
  }
  if (level.initialY) {
    Turtle.y = level.initialY;
  }
  // Clear the display.
  Turtle.ctxScratch.canvas.width = Turtle.ctxScratch.canvas.width;
  Turtle.ctxScratch.strokeStyle = '#000000';
  Turtle.ctxScratch.fillStyle = '#000000';
  Turtle.ctxScratch.lineWidth = 5;
  Turtle.ctxScratch.lineCap = 'round';
  Turtle.ctxScratch.font = 'normal 18pt Arial';
  Turtle.display();

  // Kill any task.
  if (Turtle.pid) {
    window.clearTimeout(Turtle.pid);
  }
  Turtle.pid = 0;
  Turtle.coloursUsed = [];
};

/**
 * Copy the scratch canvas to the display canvas. Add a turtle marker.
 */
Turtle.display = function() {
  Turtle.ctxDisplay.globalCompositeOperation = 'copy';
  // Draw the answer layer.
  Turtle.ctxDisplay.globalAlpha = 0.1;
  Turtle.ctxDisplay.drawImage(Turtle.ctxAnswer.canvas, 0, 0);
  Turtle.ctxDisplay.globalAlpha = 1;

  // Draw the images layer.
  Turtle.ctxDisplay.globalCompositeOperation = 'source-over';
  Turtle.ctxDisplay.drawImage(Turtle.ctxImages.canvas, 0, 0);

  // Draw the user layer.
  Turtle.ctxDisplay.globalCompositeOperation = 'source-over';
  Turtle.ctxDisplay.drawImage(Turtle.ctxScratch.canvas, 0, 0);

  // Draw the turtle.
  if (Turtle.visible) {
    // Make the turtle the colour of the pen.
    Turtle.ctxDisplay.strokeStyle = Turtle.ctxScratch.strokeStyle;
    Turtle.ctxDisplay.fillStyle = Turtle.ctxScratch.fillStyle;

    // Draw the turtle body.
    var radius = Turtle.ctxScratch.lineWidth / 2 + 10;
    Turtle.ctxDisplay.beginPath();
    Turtle.ctxDisplay.arc(Turtle.x, Turtle.y, radius, 0, 2 * Math.PI, false);
    Turtle.ctxDisplay.lineWidth = 3;
    Turtle.ctxDisplay.stroke();

    // Draw the turtle head.
    var WIDTH = 0.3;
    var HEAD_TIP = 10;
    var ARROW_TIP = 4;
    var BEND = 6;
    var radians = 2 * Math.PI * Turtle.heading / 360;
    var tipX = Turtle.x + (radius + HEAD_TIP) * Math.sin(radians);
    var tipY = Turtle.y - (radius + HEAD_TIP) * Math.cos(radians);
    radians -= WIDTH;
    var leftX = Turtle.x + (radius + ARROW_TIP) * Math.sin(radians);
    var leftY = Turtle.y - (radius + ARROW_TIP) * Math.cos(radians);
    radians += WIDTH / 2;
    var leftControlX = Turtle.x + (radius + BEND) * Math.sin(radians);
    var leftControlY = Turtle.y - (radius + BEND) * Math.cos(radians);
    radians += WIDTH;
    var rightControlX = Turtle.x + (radius + BEND) * Math.sin(radians);
    var rightControlY = Turtle.y - (radius + BEND) * Math.cos(radians);
    radians += WIDTH / 2;
    var rightX = Turtle.x + (radius + ARROW_TIP) * Math.sin(radians);
    var rightY = Turtle.y - (radius + ARROW_TIP) * Math.cos(radians);
    Turtle.ctxDisplay.beginPath();
    Turtle.ctxDisplay.moveTo(tipX, tipY);
    Turtle.ctxDisplay.lineTo(leftX, leftY);
    Turtle.ctxDisplay.bezierCurveTo(leftControlX, leftControlY,
        rightControlX, rightControlY, rightX, rightY);
    Turtle.ctxDisplay.closePath();
    Turtle.ctxDisplay.fill();
  }
};

/**
 * Click the run button.  Start the program.
 */
Turtle.runButtonClick = function() {
  document.getElementById('runButton').style.display = 'none';
  document.getElementById('resetButton').style.display = 'inline';
  document.getElementById('spinner').style.visibility = 'visible';
  Blockly.mainWorkspace.traceOn(true);
  BlocklyApps.attempts++;
  Turtle.execute();
};

/**
 * Execute the user's code.  Heaven help us...
 */
Turtle.execute = function() {
  BlocklyApps.log = [];
  BlocklyApps.ticks = 1000000;

  Turtle.code = Blockly.Generator.workspaceToCode('JavaScript');
  try {
    codegen.evalWith(Turtle.code, {
      BlocklyApps: BlocklyApps,
      Turtle: api
    });
  } catch (e) {
    // Null is thrown for infinite loop.
    // Otherwise, abnormal termination is a user error.
    if (e !== null) {
      window.alert(e);
    }
  }

  // BlocklyApps.log now contains a transcript of all the user's actions.
  // Reset the graphic and animate the transcript.
  BlocklyApps.reset();
  Turtle.pid = window.setTimeout(Turtle.animate, 100);
};

/**
 * Iterate through the recorded path and animate the turtle's actions.
 */
Turtle.animate = function() {
  // All tasks should be complete now.  Clean up the PID list.
  Turtle.pid = 0;

  var tuple = BlocklyApps.log.shift();
  if (!tuple) {
    document.getElementById('spinner').style.visibility = 'hidden';
    Blockly.mainWorkspace.highlightBlock(null);
    Turtle.checkAnswer();
    return;
  }
  var command = tuple.shift();
  BlocklyApps.highlight(tuple.pop());
  Turtle.step(command, tuple);
  Turtle.display();

  // Scale the speed non-linearly, to give better precision at the fast end.
  var stepSpeed = 1000 * Math.pow(1 - Turtle.speedSlider.getValue(), 2);
  Turtle.pid = window.setTimeout(Turtle.animate, stepSpeed);
};

/**
 * Execute one step.
 * @param {string} command Logo-style command (e.g. 'FD' or 'RT').
 * @param {!Array} values List of arguments for the command.
 */
Turtle.step = function(command, values) {
  switch (command) {
    case 'FD':  // Forward
      if (Turtle.penDownValue) {
        Turtle.ctxScratch.beginPath();
        Turtle.ctxScratch.moveTo(Turtle.x, Turtle.y);
      }
      /* falls through */
    case 'JF':  // Jump forward
      var distance = values[0];
      var bump;
      if (distance) {
        Turtle.x += distance * Math.sin(2 * Math.PI * Turtle.heading / 360);
        Turtle.y -= distance * Math.cos(2 * Math.PI * Turtle.heading / 360);
        bump = 0;
      } else {
        // WebKit (unlike Gecko) draws nothing for a zero-length line.
        bump = 0.1;
      }
      if (command == 'FD' && Turtle.penDownValue) {
        Turtle.ctxScratch.lineTo(Turtle.x, Turtle.y + bump);
        Turtle.ctxScratch.stroke();
        if (distance) {
          var colour = Turtle.ctxScratch.strokeStyle.toLowerCase();
          if (Turtle.coloursUsed.indexOf(colour) == -1) {
            Turtle.coloursUsed.push(colour);
          }
        }
      }
      break;
    case 'RT':  // Right Turn
      Turtle.heading += values[0];
      Turtle.heading %= 360;
      if (Turtle.heading < 0) {
        Turtle.heading += 360;
      }
      break;
    case 'DP':  // Draw Print
      Turtle.ctxScratch.save();
      Turtle.ctxScratch.translate(Turtle.x, Turtle.y);
      Turtle.ctxScratch.rotate(2 * Math.PI * (Turtle.heading - 90) / 360);
      Turtle.ctxScratch.fillText(values[0], 0, 0);
      Turtle.ctxScratch.restore();
      break;
    case 'DF':  // Draw Font
      Turtle.ctxScratch.font = values[2] + ' ' + values[1] + 'pt ' + values[0];
      break;
    case 'PU':  // Pen Up
      Turtle.penDownValue = false;
      break;
    case 'PD':  // Pen Down
      Turtle.penDownValue = true;
      break;
    case 'PW':  // Pen Width
      Turtle.ctxScratch.lineWidth = values[0];
      break;
    case 'PC':  // Pen Colour
      Turtle.ctxScratch.strokeStyle = values[0];
      Turtle.ctxScratch.fillStyle = values[0];
      break;
    case 'HT':  // Hide Turtle
      Turtle.visible = false;
      break;
    case 'ST':  // Show Turtle
      Turtle.visible = true;
      break;
  }
};

/**
 * The range of outcomes for evaluating the colour used on the current level.
 * @type {number}
 */
Turtle.ColourResults = {
  OK: 0,
  NONE: 1,               // No colours were used.
  FORBIDDEN_DEFAULT: 2,  // Default colour (black) was used but not permitted.
  TOO_FEW: 3,            // Fewer distinct colours were used than required.
  EXTRA: 4               // All of the required colours and more were used.
  // There is no value for "wrong colour" because we use
  // the name of the colour (as a string) instead.
};

/**
 * Returns the name of the property key in Colours whose value
 * is the given hex string.
 * @param {!string} hex The JavaScript representation of a hexadecimal
 *        value (such as "#0123ab").  The hex digits a-f must be lower-case.
 * @return {string} The name of the colour, or "UNKNOWN".  The latter
 *        should only be returned if the colour was not from Colours.
 */
Turtle.hexStringToColourName = function(hex) {
  for (var name in Colours) {
    if (Colours[name] == hex) {
      return name.toLowerCase();
    }
  }
  return 'UNKNOWN';  //  This should not happen.
};

/**
 * Check whether any required colours are present.
 * This uses level.requiredColors and Turtle.coloursUsed.
 * @return {number|string} The appropriate value in Turtle.ColourResults or
 *     the name of a missing required colour.
 */
Turtle.checkRequiredColours = function() {
  // level.requiredColors values and their meanings are:
  // - 1: There must be at least one non-black colour.
  // - 2 or higher: There must be the specified number of colours (black okay).
  // - string: The entire picture must use the named colour.
  if (!level.requiredColors) {
    return Turtle.ColourResults.OK;
  }
  if (Turtle.coloursUsed === 0) {
    return Turtle.ColourResults.NONE;
  } else if (typeof level.requiredColors == 'string') {
    for (var i = 0; i < Turtle.coloursUsed.length; i++) {
      if (Turtle.coloursUsed[i] == level.requiredColors) {
        return Turtle.coloursUsed.length == 1 ? Turtle.ColourResults.OK :
            Turtle.ColourResults.EXTRA;
      }
      return Turtle.hexStringToColourName(level.requiredColors);
    }
  } else if (level.requiredColors == 1) {
    // Any colour but black is acceptable.
    if (Turtle.coloursUsed.length == 1 &&
        Turtle.coloursUsed[0] == Colours.BLACK) {
      return Turtle.ColourResults.FORBIDDEN_DEFAULT;
    } else {
      return Turtle.ColourResults.OK;
    }
  } else {
    // level.requiredColors must be a number greater than 1.
    var surplus = Turtle.coloursUsed.length - level.requiredColors;
    if (surplus > 0) {
      return Turtle.ColourResult.EXTRA;
    } else if (surplus === 0) {
      return Turtle.ColourResults.OK;
    } else {
      return Turtle.ColourResults.TOO_FEW;
    }
  }
};

/**
 * Validate whether the user's answer is correct.
 * @param {number} pixelErrors Number of pixels that are wrong.
 * @param {number} permittedErrors Number of pixels allowed to be wrong.
 * @return {boolean} True if the level is solved, false otherwise.
 */
var isCorrect = function(pixelErrors, permittedErrors) {
  return pixelErrors < permittedErrors;
};

/**
 * Verify if the answer is correct.
 * If so, move on to next level.
 */
Turtle.checkAnswer = function() {
  // Compare the Alpha (opacity) byte of each pixel in the user's image and
  // the sample answer image.
  var userImage =
      Turtle.ctxScratch.getImageData(0, 0, Turtle.WIDTH, Turtle.HEIGHT);
  var answerImage =
      Turtle.ctxAnswer.getImageData(0, 0, Turtle.WIDTH, Turtle.HEIGHT);
  var len = Math.min(userImage.data.length, answerImage.data.length);
  var total = 0;
  var delta = 0;
  // Pixels are in RGBA format.  Only check the Alpha bytes.
  for (var i = 3; i < len; i += 4) {
    // Check the Alpha byte.
    if ((userImage.data[i] !== 0) || (answerImage.data[i] !== 0)) {
      total++;
    }
    if ((userImage.data[i] === 0) != (answerImage.data[i] === 0)) {
      delta++;
    }
  }

  // Sanity check empty canvases for unit tests.
  if (total === 0) {
    throw new Error('Blank images');
  }

  // Allow some number of pixels to be off, but be stricter
  // for certain levels.
  var permittedErrors;
  if (level.permittedErrors !== undefined) {
    permittedErrors = level.permittedErrors;
  } else {
    permittedErrors = 150;
  }
  // Test whether the current level is a free play level, or the level has
  // been completed
  BlocklyApps.levelComplete =
      level.freePlay || isCorrect(delta, permittedErrors);
  var feedbackType = BlocklyApps.getTestResults();

  var xml = Blockly.Xml.workspaceToDom(Blockly.mainWorkspace);
  var textBlocks = Blockly.Xml.domToText(xml);

  BlocklyApps.report('turtle', level.id,
                     BlocklyApps.levelComplete,
                     feedbackType,
                     textBlocks);

  // For levels where using too many blocks would allow students
  // to miss the point, convert that feedback to a failure.
  if (level.failForTooManyBlocks &&
      feedbackType == BlocklyApps.TestResults.TOO_MANY_BLOCKS_FAIL) {
    // TODO: Add more helpful error message.
    feedbackType = BlocklyApps.TestResults.OTHER_1_STAR_FAIL;

  } else if (feedbackType == BlocklyApps.TestResults.TOO_MANY_BLOCKS_FAIL ||
      feedbackType == BlocklyApps.TestResults.ALL_PASS) {
    // Check that they didn't use a crazy large repeat value when drawing a
    // circle.  This complains if the limit doesn't start with 3.
    // Note that this level does not use colour, so no need to check for that.
    if (level.failForCircleRepeatValue) {
      var code = Blockly.Generator.workspaceToCode('JavaScript');
      if (code.indexOf('count < 3') == -1) {
          feedbackType = BlocklyApps.TestResults.OTHER_2_STAR_FAIL;
      }
    } else {
      // Only check and mention colour if there is no more serious problem.
      var colourResult = Turtle.checkRequiredColours();
      if (colourResult != Turtle.ColourResults.OK &&
        colourResult != Turtle.ColourResults.EXTRA) {
        var message = '';
        feedbackType = BlocklyApps.TestResults.OTHER_1_STAR_FAIL;
        if (colourResult == Turtle.ColourResults.FORBIDDEN_DEFAULT) {
          message = msg.notBlackColour();
        } else if (colourResult == Turtle.ColourResults.TOO_FEW) {
          message = msg.tooFewColours();
          message = message.replace('%1', level.requiredColors);
          message = message.replace('%2', Turtle.coloursUsed.length);
        } else if (typeof colourResult == 'string') {
          message = msg.wrongColour().replace('%1', colourResult);
        }
        BlocklyApps.setTextForElement('appSpecificOneStarFeedback', message);
      }
    }
  }

  // If the current level is a free play, always return the free play
  // result type
  if (level.freePlay) {
    feedbackType = BlocklyApps.TestResults.FREE_PLAY;
  }

  BlocklyApps.displayFeedback({
    app: 'turtle',
    feedbackType: feedbackType
  });
};
