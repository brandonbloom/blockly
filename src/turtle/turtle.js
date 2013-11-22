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
var msg = require('../../locale/current/turtle');
var skins = require('../skins');
var levels = require('./levels');
var Colours = require('./core').Colours;
var codegen = require('../codegen');
var api = require('./api');
var page = require('../templates/page.html');

var level;
var skin;

BlocklyApps.CHECK_FOR_EMPTY_BLOCKS = false;
BlocklyApps.NUM_REQUIRED_BLOCKS_TO_FLAG = 1;

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
 * The avatar image
 */
Turtle.avatarImage = new Image();
Turtle.numberAvatarHeadings = undefined;

/**
 * Initialize Blockly and the turtle.  Called on page load.
 */
Turtle.init = function(config) {

  skin = config.skin;
  level = config.level;

  // Record instruction image url if it needs to be shown.
  if (level.instructionImage) {
    level.instructionImageUrl =
        BlocklyApps.assetUrl('media/' + level.instructionImage);
  }

  Turtle.AVATAR_HEIGHT = 51;
  Turtle.AVATAR_WIDTH = 70;

  BlocklyApps.IDEAL_BLOCK_NUM = level.ideal || Infinity;
  BlocklyApps.REQUIRED_BLOCKS = level.requiredBlocks || [];

  config.html = page({
    assetUrl: BlocklyApps.assetUrl,
    data: {
      localeDirection: BlocklyApps.localeDirection(),
      visualization: require('./visualization.html')(),
      controls: require('./controls.html')({assetUrl: BlocklyApps.assetUrl}),
      blockCounterClass : 'block-counter-default'
    }
  });

  config.loadAudio = function() {
    Blockly.loadAudio_(skin.winSound, 'win');
    Blockly.loadAudio_(skin.startSound, 'start');
    Blockly.loadAudio_(skin.failureSound, 'failure');
  };

  config.afterInject = function() {
    // Add to reserved word list: API, local variables in execution evironment
    // (execute) and the infinite loop detection function.
    //XXX Not sure if this is still right.
    Blockly.JavaScript.addReservedWords('Turtle,code');

    // Get the canvases and set their initial contents.
    Turtle.ctxDisplay = document.getElementById('display').getContext('2d');
    Turtle.ctxAnswer = document.getElementById('answer').getContext('2d');
    Turtle.ctxImages = document.getElementById('images').getContext('2d');
    Turtle.ctxScratch = document.getElementById('scratch').getContext('2d');
    Turtle.loadTurtle();
    Turtle.drawImages();
    Turtle.drawAnswer();
    
    // Adjust visualization and belowVisualization width.
    var drawAreaWidth = config.getDisplayWidth();
    var visualization = document.getElementById('visualization');
    visualization.style.width = drawAreaWidth + 'px';
    var belowVisualization = document.getElementById('belowVisualization');
    belowVisualization.style.width = drawAreaWidth + 'px';
  };

  config.getDisplayWidth = function() {
    return document.getElementById('display').width;
  };

  BlocklyApps.init(config);
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
  img.src = BlocklyApps.assetUrl('media/turtle/' + filename);
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
 * Initial the turtle image on load.
 */
Turtle.loadTurtle = function() {
  Turtle.avatarImage.onload = function() {
    Turtle.display();
  };
  Turtle.avatarImage.src = skin.avatar;
  Turtle.numberAvatarHeadings = 180;
  Turtle.avatarImage.height = Turtle.AVATAR_HEIGHT;
  Turtle.avatarImage.width = Turtle.AVATAR_WIDTH;
};

/**
 * Draw the turtle image based on Turtle.x, Turtle.y, and Turtle.heading.
 */
Turtle.drawTurtle = function() {
  // Computes the index of the image in the sprite.
  var index = Math.floor(Turtle.heading * Turtle.numberAvatarHeadings / 360);
  var sourceX = Turtle.avatarImage.width * index;
  var sourceY = 0;
  var sourceWidth = Turtle.avatarImage.width;
  var sourceHeight = Turtle.avatarImage.height;
  var destWidth = Turtle.avatarImage.width;
  var destHeight = Turtle.avatarImage.height;
  var destX = Turtle.x - destWidth / 2;
  var destY = Turtle.y - destHeight + 7;

  Turtle.ctxDisplay.drawImage(Turtle.avatarImage, sourceX, sourceY,
                              sourceWidth, sourceHeight, destX, destY,
                              destWidth, destHeight);
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
  Turtle.heading = level.startDirection !== undefined ?
      level.startDirection : 90;
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

  // Stop the looping sound.
  BlocklyApps.stopLoopingAudio('start');
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
    Turtle.drawTurtle();
  }
};

/**
 * Click the run button.  Start the program.
 */
BlocklyApps.runButtonClick = function() {
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
  BlocklyApps.playAudio('start', {volume : 0.5, loop : true});
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
 * App specific displayFeedback function that calls into
 * BlocklyApps.displayFeedback when appropriate
 */
var displayFeedback = function() {
  BlocklyApps.displayFeedback({
    app: 'turtle', //XXX
    skin: skin.id,
    feedbackType: Turtle.testResults,
    message: Turtle.message,
    response: Turtle.response,
    level: level
    });
};

/**
 * Function to be called when the service report call is complete
 * @param {object} JSON response (if available)
 */
Turtle.onReportComplete = function(response) {
  Turtle.response = response;
  displayFeedback();
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
  var delta = 0;
  // Pixels are in RGBA format.  Only check the Alpha bytes.
  for (var i = 3; i < len; i += 4) {
    // Check the Alpha byte.
    if ((userImage.data[i] === 0) != (answerImage.data[i] === 0)) {
      delta++;
    }
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
  Turtle.testResults = BlocklyApps.getTestResults();

  var xml = Blockly.Xml.workspaceToDom(Blockly.mainWorkspace);
  var textBlocks = Blockly.Xml.domToText(xml);

  // For levels where using too many blocks would allow students
  // to miss the point, convert that feedback to a failure.
  if (level.failForTooManyBlocks &&
      Turtle.testResults == BlocklyApps.TestResults.TOO_MANY_BLOCKS_FAIL) {
    // TODO: Add more helpful error message.
    Turtle.testResults = BlocklyApps.TestResults.TOO_MANY_BLOCKS_FAIL;

  } else if ((Turtle.testResults ==
      BlocklyApps.TestResults.TOO_MANY_BLOCKS_FAIL) ||
      (Turtle.testResults == BlocklyApps.TestResults.ALL_PASS)) {
    // Check that they didn't use a crazy large repeat value when drawing a
    // circle.  This complains if the limit doesn't start with 3.
    // Note that this level does not use colour, so no need to check for that.
    if (level.failForCircleRepeatValue) {
      var code = Blockly.Generator.workspaceToCode('JavaScript');
      if (code.indexOf('count < 3') == -1) {
          Turtle.testResults = BlocklyApps.TestResults.OTHER_2_STAR_FAIL;
      }
    } else {
      // Only check and mention colour if there is no more serious problem.
      var colourResult = Turtle.checkRequiredColours();
      if (colourResult != Turtle.ColourResults.OK &&
        colourResult != Turtle.ColourResults.EXTRA) {
        var message = '';
        Turtle.testResults = BlocklyApps.TestResults.OTHER_1_STAR_FAIL;
        if (colourResult == Turtle.ColourResults.FORBIDDEN_DEFAULT) {
          message = msg.notBlackColour();
        } else if (colourResult == Turtle.ColourResults.TOO_FEW) {
          message = msg.tooFewColours();
          message = message.replace('%1', level.requiredColors);
          message = message.replace('%2', Turtle.coloursUsed.length);
        } else if (typeof colourResult == 'string') {
          message = msg.wrongColour().replace('%1', colourResult);
        }
        Turtle.message = message;
      }
    }
  }

  // If the current level is a free play, always return the free play
  // result type
  if (level.freePlay) {
    Turtle.testResults = BlocklyApps.TestResults.FREE_PLAY;
  }

  // Play sound
  BlocklyApps.stopLoopingAudio('start');
  if (Turtle.testResults === BlocklyApps.TestResults.FREE_PLAY ||
      Turtle.testResults >= BlocklyApps.TestResults.TOO_MANY_BLOCKS_FAIL) {
    BlocklyApps.playAudio('win', {volume : 0.5});
  } else {
    BlocklyApps.playAudio('failure', {volume : 0.5});
  }

  BlocklyApps.report({
    app: 'turtle',
    level: level.id,
    result: BlocklyApps.levelComplete,
    testResult: Turtle.testResults,
    program: encodeURIComponent(textBlocks),
    onComplete: Turtle.onReportComplete
  });

  // The call to displayFeedback() will happen later in onReportComplete()
};
