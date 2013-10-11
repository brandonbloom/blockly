/**
 * Blockly Apps: Maze
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
 * @fileoverview JavaScript for Blockly's Maze application.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

var BlocklyApps = require('../base');
var commonMsg = require('../../en_us/i18n/common');
var mazeMsg = require('../../en_us/i18n/maze');
var skins = require('../skins');
var tiles = require('./tiles');
var codegen = require('../codegen');
var api = require('./api');
var page = require('../page.html');

var Direction = tiles.Direction;
var SquareType = tiles.SquareType;

/**
 * Create a namespace for the application.
 */
var Maze = module.exports;

var level;
var skin;

/**
 * Milliseconds between each animation frame.
 */
var stepSpeed;

//TODO: Make configurable.
BlocklyApps.CHECK_FOR_EMPTY_BLOCKS = true;

var getTile = function(map, x, y) {
  if (map && map[y]) {
    return map[y][x];
  }
};

//The number of blocks to show as feedback.
BlocklyApps.NUM_REQUIRED_BLOCKS_TO_FLAG = 1;

// Default Scalings
Maze.scale = {
  'snapRadius': 1,
  'stepSpeed': 5
};

var loadLevel = function() {
  // Load maps.
  Maze.map = level.map;
  BlocklyApps.IDEAL_BLOCK_NUM = level.ideal;
  Maze.initialDirtMap = level.initialDirt;
  Maze.finalDirtMap = level.finalDirt;
  Maze.startDirection = level.startDirection;
  BlocklyApps.REQUIRED_BLOCKS = level.requiredBlocks;

  // Override scalars.
  for (var key in level.scale) {
    Maze.scale[key] = level.scale[key];
  }

  // Measure maze dimensions and set sizes.
  // ROWS: Number of tiles down.
  Maze.ROWS = Maze.map.length;
  // COLS: Number of tiles across.
  Maze.COLS = Maze.map[0].length;
  // Pixel height and width of each maze square (i.e. tile).
  Maze.SQUARE_SIZE = 50;
  Maze.PEGMAN_HEIGHT = 52;
  Maze.PEGMAN_WIDTH = 49;
  // Height and width of the goal and obstacles.
  Maze.MARKER_HEIGHT = 43;
  Maze.MARKER_WIDTH = 50;

  Maze.MAZE_WIDTH = Maze.SQUARE_SIZE * Maze.COLS;
  Maze.MAZE_HEIGHT = Maze.SQUARE_SIZE * Maze.ROWS;
  Maze.PATH_WIDTH = Maze.SQUARE_SIZE / 3;
};

/**
 * PIDs of animation tasks currently executing.
 */
Maze.pidList = [];

// Map each possible shape to a sprite.
// Input: Binary string representing Centre/North/West/South/East squares.
// Output: [x, y] coordinates of each tile's sprite in tiles.png.
var TILE_SHAPES = {
  '10010': [4, 0],  // Dead ends
  '10001': [3, 3],
  '11000': [0, 1],
  '10100': [0, 2],
  '11010': [4, 1],  // Vertical
  '10101': [3, 2],  // Horizontal
  '10110': [0, 0],  // Elbows
  '10011': [2, 0],
  '11001': [4, 2],
  '11100': [2, 3],
  '11110': [1, 1],  // Junctions
  '10111': [1, 0],
  '11011': [2, 1],
  '11101': [1, 2],
  '11111': [2, 2],  // Cross
  'null0': [4, 3],  // Empty
  'null1': [3, 0],
  'null2': [3, 1],
  'null3': [0, 3],
  'null4': [1, 3]
};

var drawMap = function() {
  var svg = document.getElementById('svgMaze');
  var x, y, k, tile;

  // Draw the outer square.
  var square = document.createElementNS(Blockly.SVG_NS, 'rect');
  square.setAttribute('width', Maze.MAZE_WIDTH);
  square.setAttribute('height', Maze.MAZE_HEIGHT);
  square.setAttribute('fill', '#F1EEE7');
  square.setAttribute('stroke-width', 1);
  square.setAttribute('stroke', '#CCB');
  svg.appendChild(square);

  // Adjust outer element size.
  svg.setAttribute('width', Maze.MAZE_WIDTH);
  svg.setAttribute('height', Maze.MAZE_HEIGHT);

  // Adjust button table width.
  var buttonTable = document.getElementById('gameButtons');
  buttonTable.style.width = Maze.MAZE_WIDTH + 'px';

  // Size and fill-in hint bubble.
  var hintBubble = document.getElementById('bubble');
  hintBubble.style.width = (Maze.MAZE_WIDTH - 20) + 'px';
  var hint = document.getElementById('prompt');
  hint.innerHTML = level.instructions;

  if (skin.background) {
    tile = document.createElementNS(Blockly.SVG_NS, 'image');
    tile.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
                        skin.background);
    tile.setAttribute('height', Maze.MAZE_HEIGHT);
    tile.setAttribute('width', Maze.MAZE_WIDTH);
    tile.setAttribute('x', 0);
    tile.setAttribute('y', 0);
    svg.appendChild(tile);
  }

  if (skin.grid) {
    for (y = 0; y < Maze.ROWS; y += 2) {
      for (x = 0; x < Maze.ROWS; x += 2) {
        var gridElement = document.createElementNS(Blockly.SVG_NS, 'image');
        gridElement.setAttributeNS(
            'http://www.w3.org/1999/xlink', 'xlink:href', skin.grid);
        gridElement.setAttribute('height', Maze.SQUARE_SIZE * 2);
        gridElement.setAttribute('width', Maze.SQUARE_SIZE * 2);
        gridElement.setAttribute('x', x * Maze.SQUARE_SIZE);
        gridElement.setAttribute('y', y * Maze.SQUARE_SIZE);
        svg.appendChild(gridElement);
      }
    }
  }

  if (skin.graph) {
    // Draw the grid lines.
    var offset = -0.5;
    for (k = 0; k < Maze.ROWS; k++) {
      var h_line = document.createElementNS(Blockly.SVG_NS, 'line');
      h_line.setAttribute('y1', k * Maze.SQUARE_SIZE + offset);
      h_line.setAttribute('x2', Maze.MAZE_WIDTH);
      h_line.setAttribute('y2', k * Maze.SQUARE_SIZE + offset);
      h_line.setAttribute('stroke', skin.graph);
      h_line.setAttribute('stroke-width', 1);
      svg.appendChild(h_line);
    }
    for (k = 0; k < Maze.COLS; k++) {
      var v_line = document.createElementNS(Blockly.SVG_NS, 'line');
      v_line.setAttribute('x1', k * Maze.SQUARE_SIZE + offset);
      v_line.setAttribute('x2', k * Maze.SQUARE_SIZE + offset);
      v_line.setAttribute('y2', Maze.MAZE_HEIGHT);
      v_line.setAttribute('stroke', skin.graph);
      v_line.setAttribute('stroke-width', 1);
      svg.appendChild(v_line);
    }
  }

  // Draw the tiles making up the maze map.

  // Return a value of '0' if the specified square is wall or out of bounds '1'
  // otherwise (empty, obstacle, start, finish).
  var normalize = function(x, y) {
    return ((Maze.map[y] === undefined) ||
            (Maze.map[y][x] === undefined) ||
            (Maze.map[y][x] == SquareType.WALL)) ? '0' : '1';
  };

  // Compute and draw the tile for each square.
  var tileId = 0;
  for (y = 0; y < Maze.ROWS; y++) {
    for (x = 0; x < Maze.COLS; x++) {
      // Compute the tile index.
      tile = normalize(x, y) +
          normalize(x, y - 1) +  // North.
          normalize(x + 1, y) +  // West.
          normalize(x, y + 1) +  // South.
          normalize(x - 1, y);   // East.

      // Draw the tile.
      if (!TILE_SHAPES[tile]) {
        // Empty square.  Use null0 for large areas, with null1-4 for borders.
        if (tile == '00000' && Math.random() > 0.3) {
          tile = 'null0';
        } else {
          tile = 'null' + Math.floor(1 + Math.random() * 4);
        }
      }
      var left = TILE_SHAPES[tile][0];
      var top = TILE_SHAPES[tile][1];
      // Tile's clipPath element.
      var tileClip = document.createElementNS(Blockly.SVG_NS, 'clipPath');
      tileClip.setAttribute('id', 'tileClipPath' + tileId);
      var tileClipRect = document.createElementNS(Blockly.SVG_NS, 'rect');
      tileClipRect.setAttribute('width', Maze.SQUARE_SIZE);
      tileClipRect.setAttribute('height', Maze.SQUARE_SIZE);

      tileClipRect.setAttribute('x', x * Maze.SQUARE_SIZE);
      tileClipRect.setAttribute('y', y * Maze.SQUARE_SIZE);

      tileClip.appendChild(tileClipRect);
      svg.appendChild(tileClip);
      // Tile sprite.
      var tileElement = document.createElementNS(Blockly.SVG_NS, 'image');
      tileElement.setAttributeNS('http://www.w3.org/1999/xlink',
                                 'xlink:href',
                                 skin.tiles);
      tileElement.setAttribute('height', Maze.SQUARE_SIZE * 4);
      tileElement.setAttribute('width', Maze.SQUARE_SIZE * 5);
      tileElement.setAttribute('clip-path',
                               'url(#tileClipPath' + tileId + ')');
      tileElement.setAttribute('x', (x - left) * Maze.SQUARE_SIZE);
      tileElement.setAttribute('y', (y - top) * Maze.SQUARE_SIZE);
      svg.appendChild(tileElement);
      tileId++;
    }
  }

  // Pegman's clipPath element, whose (x, y) is reset by Maze.displayPegman
  var pegmanClip = document.createElementNS(Blockly.SVG_NS, 'clipPath');
  pegmanClip.setAttribute('id', 'pegmanClipPath');
  var clipRect = document.createElementNS(Blockly.SVG_NS, 'rect');
  clipRect.setAttribute('id', 'clipRect');
  clipRect.setAttribute('width', Maze.PEGMAN_WIDTH);
  clipRect.setAttribute('height', Maze.PEGMAN_HEIGHT);
  pegmanClip.appendChild(clipRect);
  svg.appendChild(pegmanClip);

  // Add pegman.
  var pegmanIcon = document.createElementNS(Blockly.SVG_NS, 'image');
  pegmanIcon.setAttribute('id', 'pegman');
  pegmanIcon.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
                            skin.avatar);
  pegmanIcon.setAttribute('height', Maze.PEGMAN_HEIGHT);
  pegmanIcon.setAttribute('width', Maze.PEGMAN_WIDTH * 21); // 49 * 21 = 1029
  pegmanIcon.setAttribute('clip-path', 'url(#pegmanClipPath)');
  svg.appendChild(pegmanIcon);

  if (Maze.finish_) {
    // Add finish marker.
    var finishMarker = document.createElementNS(Blockly.SVG_NS, 'image');
    finishMarker.setAttribute('id', 'finish');
    finishMarker.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
                                skin.goal);
    finishMarker.setAttribute('height', Maze.MARKER_HEIGHT);
    finishMarker.setAttribute('width', Maze.MARKER_WIDTH);
    svg.insertBefore(finishMarker, pegmanIcon);
  }

  // Add obstacles.
  for (y = 0; y < Maze.ROWS; y++) {
    for (x = 0; x < Maze.COLS; x++) {
      if (Maze.map[y][x] == SquareType.OBSTACLE) {
        var obsIcon = document.createElementNS(Blockly.SVG_NS, 'image');
        obsIcon.setAttribute('height', Maze.MARKER_HEIGHT);
        obsIcon.setAttribute('width', Maze.MARKER_WIDTH);
        obsIcon.setAttributeNS(
          'http://www.w3.org/1999/xlink', 'xlink:href', skin.obstacle);
        obsIcon.setAttribute('x',
                             Maze.SQUARE_SIZE * (x + 0.5) -
                             obsIcon.getAttribute('width') / 2);
        obsIcon.setAttribute('y',
                             Maze.SQUARE_SIZE * (y + 0.6) -
                             obsIcon.getAttribute('height'));
        svg.appendChild(obsIcon);
      }
    }
  }
};

var resetDirt = function() {
  // Init the dirt so that all places are empty
  Maze.dirt_ = new Array(Maze.ROWS);
  // Locate the dirt in dirt_map
  for (var y = 0; y < Maze.ROWS; y++) {
    if (Maze.initialDirtMap) {
      Maze.dirt_[y] = Maze.initialDirtMap[y].slice(0);
    } else {
      Maze.dirt_[y] = new Array(Maze.COLS);
    }
  }
};

/**
 * Initialize Blockly and the maze.  Called on page load.
 */
Maze.init = function(config) {

  skin = config.skin;
  level = config.level;
  loadLevel();

  var html = page({
    baseUrl: config.baseUrl,
    data: {
      appInstance: 'Maze',
      visualization: require('./visualization.html')()
    }
  });
  document.getElementById(config.containerId).innerHTML = html;

  config.level = level;
  BlocklyApps.init(config);

  /**
   * The richness of block colours, regardless of the hue.
   * MOOC blocks should be brighter (target audience is younger).
   * Must be in the range of 0 (inclusive) to 1 (exclusive).
   * Blockly's default is 0.45.
   */
  Blockly.HSV_SATURATION = 0.6;

  var div = document.getElementById('blockly');
  BlocklyApps.inject(div, {
    toolbox: level.toolbox
  });

  Blockly.loadAudio_(skin.win, 'win');
  Blockly.loadAudio_(skin.whack, 'whack');
  Blockly.SNAP_RADIUS *= Maze.scale.snapRadius;

  // Locate the start and finish squares.
  for (var y = 0; y < Maze.ROWS; y++) {
    for (var x = 0; x < Maze.COLS; x++) {
      if (Maze.map[y][x] == SquareType.START) {
        Maze.start_ = {x: x, y: y};
      } else if (Maze.map[y][x] == SquareType.FINISH) {
        Maze.finish_ = {x: x, y: y};
      } else if (Maze.map[y][x] == SquareType.STARTANDFINISH) {
        Maze.start_ = {x: x, y: y};
        Maze.finish_ = {x: x, y: y};
      }
    }
  }

  resetDirt();

  drawMap();

  if (level.editCode) {
    document.getElementById('codeTextbox').style.display = 'block';
    div.style.display = 'none';
  }

  var onresize = function() {
    var width = document.getElementById('svgMaze').width.animVal.value;
    BlocklyApps.onResize(width);
  }

  window.addEventListener('scroll', function() {
    onresize();
    Blockly.fireUiEvent(window, 'resize');
  });
  window.addEventListener('resize', onresize);
  onresize();

  if (!level.editCode) {
    Blockly.svgResize();
  }

  // Add the starting block(s).
  var startBlocks = level.startBlocks ||
      '<block type="maze_moveForward" x="70" y="70"></block>';
  // If config.level.startBlocks is passed in, it overrides level.startBlocks
  BlocklyApps.loadBlocks(startBlocks);

  BlocklyApps.reset(true);
  Blockly.addChangeListener(function() {
    BlocklyApps.updateCapacity();
  });
};

/**
 * Reset the maze to the start position and kill any pending animation tasks.
 * @param {boolean} first True if an opening animation is to be played.
 */
BlocklyApps.reset = function(first) {
  var i;
  // Kill all tasks.
  for (i = 0; i < Maze.pidList.length; i++) {
    window.clearTimeout(Maze.pidList[i]);
  }
  Maze.pidList = [];

  // Move Pegman into position.
  Maze.pegmanX = Maze.start_.x;
  Maze.pegmanY = Maze.start_.y;

  if (first) {
    Maze.pegmanD = Maze.startDirection + 1;
    Maze.scheduleFinish(false);
    Maze.pidList.push(window.setTimeout(function() {
      stepSpeed = 100;
      Maze.schedule([Maze.pegmanX, Maze.pegmanY, Maze.pegmanD * 4],
                    [Maze.pegmanX, Maze.pegmanY, Maze.pegmanD * 4 - 4]);
      Maze.pegmanD++;
    }, stepSpeed * 5));
  } else {
    Maze.pegmanD = Maze.startDirection;
    Maze.displayPegman(Maze.pegmanX, Maze.pegmanY, Maze.pegmanD * 4);
  }

  var svg = document.getElementById('svgMaze');

  if (Maze.finish_) {
    // Move the finish icon into position.
    var finishIcon = document.getElementById('finish');
    finishIcon.setAttribute('x', Maze.SQUARE_SIZE * (Maze.finish_.x + 0.5) -
        finishIcon.getAttribute('width') / 2);
    finishIcon.setAttribute('y', Maze.SQUARE_SIZE * (Maze.finish_.y + 0.6) -
        finishIcon.getAttribute('height'));
  }

  // Make 'look' icon invisible and promote to top.
  var lookIcon = document.getElementById('look');
  lookIcon.style.display = 'none';
  lookIcon.parentNode.appendChild(lookIcon);
  var paths = lookIcon.getElementsByTagName('path');
  for (i = 0; i < paths.length; i++) {
    var path = paths[i];
    path.setAttribute('stroke', skin.look);
  }

  // Move the init dirt marker icons into position.
  var dirtId = 0;
  var pegmanIcon = document.getElementById('pegman');
  resetDirt();
  for (var y = 0; y < Maze.ROWS; y++) {
    for (var x = 0; x < Maze.COLS; x++) {
      // Remove all dirt from svg element, less efficient than checking if we
      // need to remove, but much easier to code.
      var dirtIcon = document.getElementById('dirt' + dirtId);
      if (dirtIcon !== null) {
        svg.removeChild(dirtIcon);
      }
      // Place dirt if one exists in cell.
      if (getTile(Maze.dirt_, x, y) !== 0 &&
          getTile(Maze.dirt_, x, y) !== undefined) {
        dirtIcon = document.createElementNS(Blockly.SVG_NS, 'image');
        dirtIcon.setAttribute('id', 'dirt' + dirtId);
        Maze.setDirtImage(dirtIcon, x, y);
        dirtIcon.setAttribute('height', 50);
        dirtIcon.setAttribute('width', 42);
        svg.insertBefore(dirtIcon, pegmanIcon);
        dirtIcon.setAttribute('x',
            Maze.SQUARE_SIZE * (x + 0.5) - dirtIcon.getAttribute('width') / 2);
        dirtIcon.setAttribute('y',
            Maze.SQUARE_SIZE * (y + 0.6) - dirtIcon.getAttribute('height'));
      }
      ++dirtId;
    }
  }
};

/**
 * Click the run button.  Start the program.
 */
// XXX This is the only method used by the templates!
Maze.runButtonClick = function() {
  // Only allow a single top block on some levels.
  if (level.singleTopBlock &&
      Blockly.mainWorkspace.getTopBlocks().length > 1) {
    window.alert(commonMsg.oneTopBlock());
    return;
  }
  var runButton = document.getElementById('runButton');
  var resetButton = document.getElementById('resetButton');
  // Ensure that Reset button is at least as wide as Run button.
  if (!resetButton.style.minWidth) {
    resetButton.style.minWidth = runButton.offsetWidth + 'px';
  }
  runButton.style.display = 'none';
  resetButton.style.display = 'inline';
  Blockly.mainWorkspace.traceOn(true);
  BlocklyApps.reset(false);
  BlocklyApps.attempts++;
  Maze.execute();
};

/**
 * Outcomes of running the user program.
 */
var ResultType = {
  UNSET: 0,
  SUCCESS: 1,
  FAILURE: -1,
  TIMEOUT: 2,
  ERROR: -2
};

var displayFeedback = function() {
  BlocklyApps.displayFeedback({
    app: 'maze', //XXX
    skin: skin.id,
    feedbackType: Maze.testResults,
    finalLevel: false //TODO: Get from server or otherwise parameterize
  });
};

/**
 * Execute the user's code.  Heaven help us...
 */
Maze.execute = function() {
  BlocklyApps.log = [];
  BlocklyApps.ticks = 50; //TODO: Set higher for some levels
  var code = Blockly.Generator.workspaceToCode('JavaScript');
  Maze.result = ResultType.UNSET;
  Maze.testResults = BlocklyApps.TestResults.NO_TESTS_RUN;

  // Check for empty top level blocks to warn user about bugs,
  // especially ones that lead to infinite loops.
  if (BlocklyApps.hasEmptyTopLevelBlocks()) {
    Maze.testResults = BlocklyApps.TestResults.EMPTY_BLOCK_FAIL;
    displayFeedback();
    return;
  }

  if (level.editCode) {
    // Check for innerText && textContent (for IE compat).
    var codeTextbox = document.getElementById('codeTextbox');
    code = codeTextbox.innerText || codeTextbox.textContent;
    // Insert aliases from level codeBlocks into code
    if (level.codeFunctions) {
      for (var i = 0; i < level.codeFunctions.length; i++) {
        var codeFunction = level.codeFunctions[i];
        if (codeFunction.alias) {
          code = codeFunction.func +
              " = function() { " + codeFunction.alias + " };" + code;
        }
      }
    }
  }

  // Try running the user's code.  There are four possible outcomes:
  // 1. If pegman reaches the finish [SUCCESS], true is thrown.
  // 2. If the program is terminated due to running too long [TIMEOUT],
  //    false is thrown.
  // 3. If another error occurs [ERROR], that error is thrown.
  // 4. If the program ended normally but without solving the maze [FAILURE],
  //    no error or exception is thrown.
  // The animation should be fast if execution was successful, slow otherwise
  // to help the user see the mistake.
  try {
    codegen.evalWith(code, {
      BlocklyApps: BlocklyApps,
      Maze: api
    });
    Maze.result = ResultType.FAILURE;
    stepSpeed = 150;
  } catch (e) {
    // A boolean is thrown for normal termination. XXX Except when it isn't...
    // Abnormal termination is a user error.
    if (e === Infinity) {
      Maze.result = ResultType.TIMEOUT;
      stepSpeed = 0;  // Go infinitely fast so program ends quickly.
    } else if (e === true) {
      Maze.result = ResultType.SUCCESS;
      stepSpeed = 100;
    } else if (e === false) {
      Maze.result = ResultType.ERROR;
      stepSpeed = 150;
    } else {
      // Syntax error, can't happen.
      Maze.result = ResultType.ERROR;
      window.alert(e);
      return;
    }
  }

  // If we know they succeeded, mark levelComplete true
  // Note that we have not yet animated the succesful run
  BlocklyApps.levelComplete = (Maze.result == ResultType.SUCCESS);

  Maze.testResults = BlocklyApps.getTestResults();

  if (level.editCode) {
    Maze.testResults = BlocklyApps.levelComplete ?
      BlocklyApps.TestResults.ALL_PASS :
      BlocklyApps.TestResults.TOO_FEW_BLOCKS_FAIL;
  }

  var xml = Blockly.Xml.workspaceToDom(Blockly.mainWorkspace);
  var textBlocks = Blockly.Xml.domToText(xml);

  // Report result to server.
  BlocklyApps.report(
    'maze',
    level.id,
    Maze.result === ResultType.SUCCESS,
    Maze.testResults,
    textBlocks);

  // BlocklyApps.log now contains a transcript of all the user's actions.
  // Reset the maze and animate the transcript.
  BlocklyApps.reset(false);
  Maze.pidList.push(window.setTimeout(Maze.animate, stepSpeed));
};

/**
 * Iterate through the recorded path and animate pegman's actions.
 */
Maze.animate = function() {
  // All tasks should be complete now.  Clean up the PID list.
  Maze.pidList = [];

  var action = BlocklyApps.log.shift();
  if (!action) {
    BlocklyApps.highlight(null);
    if (Maze.result == ResultType.TIMEOUT) {
      displayFeedback();
    } else {
      window.setTimeout(function() {
        displayFeedback();
      }, 1000);
    }
    return;
  }

  BlocklyApps.highlight(action[1]);

  switch (action[0]) {
    case 'north':
      Maze.schedule([Maze.pegmanX, Maze.pegmanY, Maze.pegmanD * 4],
                    [Maze.pegmanX, Maze.pegmanY - 1, Maze.pegmanD * 4]);
      Maze.pegmanY--;
      break;
    case 'east':
      Maze.schedule([Maze.pegmanX, Maze.pegmanY, Maze.pegmanD * 4],
                    [Maze.pegmanX + 1, Maze.pegmanY, Maze.pegmanD * 4]);
      Maze.pegmanX++;
      break;
    case 'south':
      Maze.schedule([Maze.pegmanX, Maze.pegmanY, Maze.pegmanD * 4],
                    [Maze.pegmanX, Maze.pegmanY + 1, Maze.pegmanD * 4]);
      Maze.pegmanY++;
      break;
    case 'west':
      Maze.schedule([Maze.pegmanX, Maze.pegmanY, Maze.pegmanD * 4],
                    [Maze.pegmanX - 1, Maze.pegmanY, Maze.pegmanD * 4]);
      Maze.pegmanX--;
      break;
    case 'look_north':
      Maze.scheduleLook(Direction.NORTH);
      break;
    case 'look_east':
      Maze.scheduleLook(Direction.EAST);
      break;
    case 'look_south':
      Maze.scheduleLook(Direction.SOUTH);
      break;
    case 'look_west':
      Maze.scheduleLook(Direction.WEST);
      break;
    case 'fail_forward':
      Maze.scheduleFail(true);
      break;
    case 'fail_backward':
      Maze.scheduleFail(false);
      break;
    case 'left':
      Maze.schedule([Maze.pegmanX, Maze.pegmanY, Maze.pegmanD * 4],
                    [Maze.pegmanX, Maze.pegmanY, Maze.pegmanD * 4 - 4]);
      Maze.pegmanD = Maze.constrainDirection4(Maze.pegmanD - 1);
      break;
    case 'right':
      Maze.schedule([Maze.pegmanX, Maze.pegmanY, Maze.pegmanD * 4],
                    [Maze.pegmanX, Maze.pegmanY, Maze.pegmanD * 4 + 4]);
      Maze.pegmanD = Maze.constrainDirection4(Maze.pegmanD + 1);
      break;
    case 'finish':
      // Only schedule victory animation for certain conditions:
      switch (Maze.testResults) {
        case BlocklyApps.TestResults.FREE_PLAY:
        case BlocklyApps.TestResults.TOO_MANY_BLOCKS_FAIL:
        case BlocklyApps.TestResults.ALL_PASS:
          Maze.scheduleFinish(true);
          break;
        default:
          break;
      }
      break;
    case 'putdown':
      Maze.scheduleFill();
      break;
    case 'pickup':
      Maze.scheduleDig();
      break;
    default:
      // action[0] is null if generated by BlocklyApps.checkTimeout().
      break;
  }

  // Speeding up specific levels
  var scaledStepSpeed = stepSpeed * Maze.scale.stepSpeed;
  Maze.pidList.push(window.setTimeout(Maze.animate, scaledStepSpeed));
};

/**
 * Schedule the animations for a move or turn.
 * @param {!Array.<number>} startPos X, Y and direction starting points.
 * @param {!Array.<number>} endPos X, Y and direction ending points.
 */
Maze.schedule = function(startPos, endPos) {
  var deltas = [(endPos[0] - startPos[0]) / 4,
                (endPos[1] - startPos[1]) / 4,
                (endPos[2] - startPos[2]) / 4];
  Maze.displayPegman(startPos[0] + deltas[0],
                     startPos[1] + deltas[1],
                     Maze.constrainDirection16(startPos[2] + deltas[2]));
  Maze.pidList.push(window.setTimeout(function() {
      Maze.displayPegman(startPos[0] + deltas[0] * 2,
          startPos[1] + deltas[1] * 2,
          Maze.constrainDirection16(startPos[2] + deltas[2] * 2));
    }, stepSpeed));
  Maze.pidList.push(window.setTimeout(function() {
      Maze.displayPegman(startPos[0] + deltas[0] * 3,
          startPos[1] + deltas[1] * 3,
          Maze.constrainDirection16(startPos[2] + deltas[2] * 3));
    }, stepSpeed * 2));
  Maze.pidList.push(window.setTimeout(function() {
      Maze.displayPegman(endPos[0], endPos[1],
          Maze.constrainDirection16(endPos[2]));
    }, stepSpeed * 3));
};

/**
 * Schedule the animations and sounds for a failed move.
 * @param {boolean} forward True if forward, false if backward.
 */
Maze.scheduleFail = function(forward) {
  var deltaX = 0;
  var deltaY = 0;
  switch (Maze.pegmanD) {
    case Direction.NORTH:
      deltaY = -0.25;
      break;
    case Direction.EAST:
      deltaX = 0.25;
      break;
    case Direction.SOUTH:
      deltaY = 0.25;
      break;
    case Direction.WEST:
      deltaX = -0.25;
      break;
  }
  if (!forward) {
    deltaX = -deltaX;
    deltaY = -deltaY;
  }
  var direction16 = Maze.constrainDirection16(Maze.pegmanD * 4);
  Maze.displayPegman(Maze.pegmanX + deltaX,
                     Maze.pegmanY + deltaY,
                     direction16);
  Blockly.playAudio('whack', 0.5);
  Maze.pidList.push(window.setTimeout(function() {
    Maze.displayPegman(Maze.pegmanX,
                       Maze.pegmanY,
                       direction16);
    }, stepSpeed));
  Maze.pidList.push(window.setTimeout(function() {
    Maze.displayPegman(Maze.pegmanX + deltaX,
                       Maze.pegmanY + deltaY,
                       direction16);
    Blockly.playAudio('whack', 0.5);
  }, stepSpeed * 2));
  Maze.pidList.push(window.setTimeout(function() {
      Maze.displayPegman(Maze.pegmanX, Maze.pegmanY, direction16);
    }, stepSpeed * 3));
};

/**
 * Schedule the animations and sound for a victory dance.
 * @param {boolean} sound Play the victory sound.
 */
Maze.scheduleFinish = function(sound) {
  var direction16 = Maze.constrainDirection16(Maze.pegmanD * 4);
  Maze.displayPegman(Maze.pegmanX, Maze.pegmanY, 16);
  if (sound) {
    Blockly.playAudio('win', 0.5);
  }
  stepSpeed = 150;  // Slow down victory animation a bit.
  Maze.pidList.push(window.setTimeout(function() {
    Maze.displayPegman(Maze.pegmanX, Maze.pegmanY, 18);
    }, stepSpeed));
  Maze.pidList.push(window.setTimeout(function() {
    Maze.displayPegman(Maze.pegmanX, Maze.pegmanY, 16);
    }, stepSpeed * 2));
  Maze.pidList.push(window.setTimeout(function() {
      Maze.displayPegman(Maze.pegmanX, Maze.pegmanY, direction16);
    }, stepSpeed * 3));
};

/**
 * Display Pegman at the specified location, facing the specified direction.
 * @param {number} x Horizontal grid (or fraction thereof).
 * @param {number} y Vertical grid (or fraction thereof).
 * @param {number} d Direction (0 - 15) or dance (16 - 17).
 */
Maze.displayPegman = function(x, y, d) {
  var pegmanIcon = document.getElementById('pegman');
  pegmanIcon.setAttribute('x',
      x * Maze.SQUARE_SIZE - d * Maze.PEGMAN_WIDTH + 1);
  pegmanIcon.setAttribute('y',
      Maze.SQUARE_SIZE * (y + 0.5) - Maze.PEGMAN_HEIGHT / 2 - 8);

  var clipRect = document.getElementById('clipRect');
  clipRect.setAttribute('x', x * Maze.SQUARE_SIZE + 1);
  clipRect.setAttribute('y', pegmanIcon.getAttribute('y'));
};

/**
 * Schedule to add dirt at pegman's current position.
 */
Maze.scheduleFill = function() {
  var x = Maze.pegmanX;
  var y = Maze.pegmanY;
  var dirtId = x + Maze.COLS * y;
  var dirtIcon;
  var pegmanIcon = document.getElementById('pegman');
  if (Maze.dirt_[y][x] < -1 || Maze.dirt_[y][x] > 0) {
    // There is already a dirt icon at the position
    dirtIcon = document.getElementById('dirt' + dirtId);
    ++Maze.dirt_[y][x];
    Maze.setDirtImage(dirtIcon, x, y);
    dirtIcon.setAttribute('x', Maze.SQUARE_SIZE * (x + 0.5) -
                          dirtIcon.getAttribute('width') / 2);
    dirtIcon.setAttribute('y', Maze.SQUARE_SIZE * (y + 0.6) -
                          dirtIcon.getAttribute('height'));
  } else {
    var svgMaze = document.getElementById('svgMaze');
    if (Maze.dirt_[y][x] === 0) {
      // If not, create a new dirtIcon for the current location
      dirtIcon = document.createElementNS(Blockly.SVG_NS, 'image');
      dirtIcon.setAttribute('id', 'dirt' + dirtId);
      dirtIcon.setAttribute('height', 50);
      dirtIcon.setAttribute('width', 42);
      svgMaze.insertBefore(dirtIcon, pegmanIcon);

      ++Maze.dirt_[y][x];
      Maze.setDirtImage(dirtIcon, x, y);
      dirtIcon.setAttribute('x', Maze.SQUARE_SIZE * (x + 0.5) -
                            dirtIcon.getAttribute('width') / 2);
      dirtIcon.setAttribute('y', Maze.SQUARE_SIZE * (y + 0.6) -
                            dirtIcon.getAttribute('height'));
    } else if (Maze.dirt_[y][x] == -1) {
      // Remove the dirtIcon
      dirtIcon = document.getElementById('dirt' + dirtId);
      svgMaze.removeChild(dirtIcon);
       ++Maze.dirt_[y][x];
    }
  }
};

/**
 * Set the image based on the amount of dirt at the location.
 * @param dirtIcon Dirt icon that shows the amount of dirt at location [y,x].
 * @param {number} x Horizontal grid (or fraction thereof).
 * @param {number} y Vertical grid (or fraction thereof).
 */
Maze.setDirtImage = function(dirtIcon, x, y) {
  dirtIcon.setAttributeNS(
    'http://www.w3.org/1999/xlink', 'xlink:href',
    skin.dirt(Maze.dirt_[y][x]));
};

/**
 * Schedule to remove dirt at pegman's current location.
 */
Maze.scheduleDig = function() {
  var x = Maze.pegmanX;
  var y = Maze.pegmanY;
  var dirtId = x + Maze.COLS * y;
  var dirtIcon;
  var pegmanIcon = document.getElementById('pegman');
  if (Maze.dirt_[y][x] > 1 || Maze.dirt_[y][x] < 0) {
    // The dirtIcon should still exist after removing dirt
    Maze.dirt_[y][x] = Maze.dirt_[y][x] - 1;
    dirtIcon = document.getElementById('dirt' + dirtId);
    Maze.setDirtImage(dirtIcon, x, y);
  } else {
    var svg = document.getElementById('svgMaze');
    if (Maze.dirt_[y][x] === 0) {
      // Create dirtIcon
      Maze.dirt_[y][x] = Maze.dirt_[y][x] - 1;
      dirtIcon = document.createElementNS(Blockly.SVG_NS, 'image');
      dirtIcon.setAttribute('id', 'dirt' + dirtId);
      dirtIcon.setAttribute('height', 50);
      dirtIcon.setAttribute('width', 42);
      svg.insertBefore(dirtIcon, pegmanIcon);

      Maze.setDirtImage(dirtIcon, x, y);
      dirtIcon.setAttribute('x', Maze.SQUARE_SIZE * (x + 0.5) -
                            dirtIcon.getAttribute('width') / 2);
      dirtIcon.setAttribute('y', Maze.SQUARE_SIZE * (y + 0.6) -
                            dirtIcon.getAttribute('height'));
    } else if (Maze.dirt_[y][x] == 1) {
      // Need to remove this dirtIcon
      dirtIcon = document.getElementById('dirt' + dirtId);
      svg.removeChild(dirtIcon);
      Maze.dirt_[y][x] = Maze.dirt_[y][x] - 1;
    }
  }
};

/**
 * Display the look icon at Pegman's current location,
 * in the specified direction.
 * @param {!Direction} d Direction (0 - 3).
 */
Maze.scheduleLook = function(d) {
  var x = Maze.pegmanX;
  var y = Maze.pegmanY;
  switch (d) {
    case Direction.NORTH:
      x += 0.5;
      break;
    case Direction.EAST:
      x += 1;
      y += 0.5;
      break;
    case Direction.SOUTH:
      x += 0.5;
      y += 1;
      break;
    case Direction.WEST:
      y += 0.5;
      break;
  }
  x *= Maze.SQUARE_SIZE;
  y *= Maze.SQUARE_SIZE;
  d = d * 90 - 45;

  var lookIcon = document.getElementById('look');
  lookIcon.setAttribute('transform',
      'translate(' + x + ', ' + y + ') ' +
      'rotate(' + d + ' 0 0) scale(.4)');
  var paths = lookIcon.getElementsByTagName('path');
  lookIcon.style.display = 'inline';
  for (var i = 0; i < paths.length; i++) {
    var path = paths[i];
    Maze.scheduleLookStep(path, stepSpeed * i);
  }
};

/**
 * Schedule one of the 'look' icon's waves to appear, then disappear.
 * @param {!Element} path Element to make appear.
 * @param {number} delay Milliseconds to wait before making wave appear.
 */
Maze.scheduleLookStep = function(path, delay) {
  Maze.pidList.push(window.setTimeout(function() {
    path.style.display = 'inline';
    window.setTimeout(function() {
      path.style.display = 'none';
    }, stepSpeed * 2);
  }, delay));
};

/**
 * Keep the direction within 0-3, wrapping at both ends.
 * @param {number} d Potentially out-of-bounds direction value.
 * @return {number} Legal direction value.
 */
Maze.constrainDirection4 = function(d) {
  if (d < 0) {
    d += 4;
  } else if (d > 3) {
    d -= 4;
  }
  return d;
};

/**
 * Keep the direction within 0-15, wrapping at both ends.
 * @param {number} d Potentially out-of-bounds direction value.
 * @return {number} Legal direction value.
 */
Maze.constrainDirection16 = function(d) {
  if (d < 0) {
    d += 16;
  } else if (d > 15) {
    d -= 16;
  }
  return d;
};

var atFinish = function() {
  return !Maze.finish_ ||
      (Maze.pegmanX == Maze.finish_.x && Maze.pegmanY == Maze.finish_.y);
};

var isDirtCorrect = function() {
  for (var y = 0; y < Maze.ROWS; y++) {
    for (var x = 0; x < Maze.COLS; x++) {
      if (getTile(Maze.dirt_, x, y) != getTile(Maze.finalDirtMap, x, y)) {
        return false;
      }
    }
  }
  return true;
};

Maze.checkSuccess = function() {
  if (atFinish() && isDirtCorrect()) {
    // Finished.  Terminate the user's program.
    BlocklyApps.log.push(['finish', null]);
    throw true;
  }
};

/**
 * Updates the tooManyBlocksError message with the ideal number of blocks so
 * the student can better understand how to improve their code.
 */
Maze.setIdealBlockMessage = function() {
  var idealNumMsg = document.getElementById('idealNumberMessage');
  var idealNumText = document.createTextNode(Maze.IDEAL_BLOCK_NUM);
  idealNumMsg.appendChild(idealNumText);
};
