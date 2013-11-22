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
var commonMsg = require('../../locale/current/common');
var mazeMsg = require('../../locale/current/maze');
var skins = require('../skins');
var tiles = require('./tiles');
var codegen = require('../codegen');
var api = require('./api');
var page = require('../templates/page.html');
var feedback = require('../feedback.js');
var dom = require('../dom');

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
  BlocklyApps.IDEAL_BLOCK_NUM = level.ideal || Infinity;
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
  // Initialize the wallMap.
  initWallMap();
  // Pixel height and width of each maze square (i.e. tile).
  Maze.SQUARE_SIZE = 50;
  Maze.PEGMAN_HEIGHT = skin.pegmanHeight;
  Maze.PEGMAN_WIDTH = skin.pegmanWidth;
  // Height and width of the goal and obstacles.
  Maze.MARKER_HEIGHT = 43;
  Maze.MARKER_WIDTH = 50;
  // Height and width of the dirt piles/holes.
  Maze.DIRT_HEIGHT = 50;
  Maze.DIRT_WIDTH = 50;
  // The number line is [-inf, min, min+1, ... no zero ..., max-1, max, +inf]
  Maze.DIRT_MAX = 10;
  Maze.DIRT_COUNT = Maze.DIRT_MAX * 2 + 2;

  Maze.MAZE_WIDTH = Maze.SQUARE_SIZE * Maze.COLS;
  Maze.MAZE_HEIGHT = Maze.SQUARE_SIZE * Maze.ROWS;
  Maze.PATH_WIDTH = Maze.SQUARE_SIZE / 3;
};


var initWallMap = function() {
  Maze.wallMap = new Array(Maze.ROWS);
  for (var y = 0; y < Maze.ROWS; y++) {
    Maze.wallMap[y] = new Array(Maze.COLS);
  }
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
  
  // Adjust visualization and belowVisualization width.
  var visualization = document.getElementById('visualization');
  visualization.style.width = Maze.MAZE_WIDTH + 'px';
  var belowVisualization = document.getElementById('belowVisualization');
  belowVisualization.style.width = Maze.MAZE_WIDTH + 'px';

  // Adjust button table width.
  var buttonTable = document.getElementById('gameButtons');
  buttonTable.style.width = Maze.MAZE_WIDTH + 'px';

  var hintBubble = document.getElementById('bubble');
  hintBubble.style.width = Maze.MAZE_WIDTH + 'px';

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

  if (skin.graph) {
    // Draw the grid lines.
    // The grid lines are offset so that the lines pass through the centre of
    // each square.  A half-pixel offset is also added to as standard SVG
    // practice to avoid blurriness.
    var offset = Maze.SQUARE_SIZE / 2 + 0.5;
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
          Maze.wallMap[y][x] = 0;
          tile = 'null0';
        } else {
          var wallIdx = Math.floor(1 + Math.random() * 4);
          Maze.wallMap[y][x] = wallIdx;
          tile = 'null' + wallIdx;
        }

        // For the first 3 levels in maze, only show the null0 image.
        if (level.id == '2_1' || level.id == '2_2' || level.id == '2_3') {
          Maze.wallMap[y][x] = 0;
          tile = 'null0';
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
      tileElement.setAttribute('id', 'tileElement' + tileId);
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
      // Tile animation
      var tileAnimation = document.createElementNS(Blockly.SVG_NS,
                                                   'animate');
      tileAnimation.setAttribute('id', 'tileAnimation' + tileId);
      tileAnimation.setAttribute('attributeType', 'CSS');
      tileAnimation.setAttribute('attributeName', 'opacity');
      tileAnimation.setAttribute('from', 1);
      tileAnimation.setAttribute('to', 0);
      tileAnimation.setAttribute('dur', '1s');
      tileAnimation.setAttribute('begin', 'indefinite');
      tileElement.appendChild(tileAnimation);

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
    svg.appendChild(finishMarker);
  }

  // Add wall hitting animation
  if (skin.hittingWallAnimation) {
    var wallAnimationIcon = document.createElementNS(Blockly.SVG_NS, 'image');
    wallAnimationIcon.setAttribute('id', 'wallAnimation');
    wallAnimationIcon.setAttribute('height', Maze.SQUARE_SIZE);
    wallAnimationIcon.setAttribute('width', Maze.SQUARE_SIZE);
    svg.appendChild(wallAnimationIcon);
  }

  // Add obstacles.
  var obsId = 0;
  for (y = 0; y < Maze.ROWS; y++) {
    for (x = 0; x < Maze.COLS; x++) {
      if (Maze.map[y][x] == SquareType.OBSTACLE) {
        var obsIcon = document.createElementNS(Blockly.SVG_NS, 'image');
        obsIcon.setAttribute('id', 'obstacle' + obsId);
        obsIcon.setAttribute('height', Maze.MARKER_HEIGHT * skin.obstacleScale);
        obsIcon.setAttribute('width', Maze.MARKER_WIDTH * skin.obstacleScale);
        obsIcon.setAttributeNS(
          'http://www.w3.org/1999/xlink', 'xlink:href', skin.obstacle);
        obsIcon.setAttribute('x',
                             Maze.SQUARE_SIZE * (x + 0.5) -
                             obsIcon.getAttribute('width') / 2);
        obsIcon.setAttribute('y',
                             Maze.SQUARE_SIZE * (y + 0.9) -
                             obsIcon.getAttribute('height'));
        svg.appendChild(obsIcon);
      }
      ++obsId;
    }
  }

  // Add idle pegman.
  if (skin.idlePegmanAnimation) {
    createPegmanAnimation({
      idStr: 'idle',
      pegmanImage: skin.idlePegmanAnimation,
      row: Maze.start_.y,
      col: Maze.start_.x,
      direction: Maze.startDirection
    });
  }

  // Add the hidden dazed pegman when hitting the wall.
  if (skin.wallPegmanAnimation) {
    createPegmanAnimation({
      idStr: 'wall',
      pegmanImage: skin.wallPegmanAnimation
    });
  }

  // Add the hidden moving pegman animation.
  if (skin.movePegmanAnimation) {
    createPegmanAnimation({
      idStr: 'move',
      pegmanImage: skin.movePegmanAnimation,
      numColPegman: 4,
      numRowPegman: 9
    });
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

  config.html = page({
    assetUrl: BlocklyApps.assetUrl,
    data: {
      localeDirection: BlocklyApps.localeDirection(),
      visualization: require('./visualization.html')(),
      blockCounterClass : 'block-counter-default'
    }
  });

  config.loadAudio = function() {
    Blockly.loadAudio_(skin.winSound, 'win');
    Blockly.loadAudio_(skin.startSound, 'start');
    Blockly.loadAudio_(skin.failureSound, 'failure');
    Blockly.loadAudio_(skin.obstacleSound, 'obstacle');
    // Load wall sounds.
    Blockly.loadAudio_(skin.wallSound, 'wall');
    if (skin.additionalSound) {
      Blockly.loadAudio_(skin.wall0Sound, 'wall0');
      Blockly.loadAudio_(skin.wall1Sound, 'wall1');
      Blockly.loadAudio_(skin.wall2Sound, 'wall2');
      Blockly.loadAudio_(skin.wall3Sound, 'wall3');
      Blockly.loadAudio_(skin.wall4Sound, 'wall4');
      Blockly.loadAudio_(skin.winGoalSound, 'winGoal');
    }
    if (skin.dirtSound) {
      Blockly.loadAudio_(skin.fillSound, 'fill');
      Blockly.loadAudio_(skin.digSound, 'dig');
    }
  };

  config.afterInject = function() {
    /**
     * The richness of block colours, regardless of the hue.
     * MOOC blocks should be brighter (target audience is younger).
     * Must be in the range of 0 (inclusive) to 1 (exclusive).
     * Blockly's default is 0.45.
     */
    Blockly.HSV_SATURATION = 0.6;

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
  };

  config.getDisplayWidth = function() {
    var visualization = document.getElementById('visualization');
    return visualization.getBoundingClientRect().width;
  };

  BlocklyApps.init(config);
};

var dirtPositionToIndex = function(row, col) {
  return Maze.COLS * row + col;
};

var createDirt = function(row, col) {
  var pegmanIcon = document.getElementById('pegman');
  var svg = document.getElementById('svgMaze');
  var index = dirtPositionToIndex(row, col);
  // Create clip path.
  var clip = document.createElementNS(Blockly.SVG_NS, 'clipPath');
  clip.setAttribute('id', 'dirtClip' + index);
  var rect = document.createElementNS(Blockly.SVG_NS, 'rect');
  rect.setAttribute('x', col * Maze.DIRT_WIDTH);
  rect.setAttribute('y', row * Maze.DIRT_HEIGHT);
  rect.setAttribute('width', Maze.DIRT_WIDTH);
  rect.setAttribute('height', Maze.DIRT_HEIGHT);
  clip.appendChild(rect);
  svg.insertBefore(clip, pegmanIcon);
  // Create image.
  var img = document.createElementNS(Blockly.SVG_NS, 'image');
  img.setAttributeNS(
      'http://www.w3.org/1999/xlink', 'xlink:href', skin.dirt);
  img.setAttribute('height', Maze.DIRT_HEIGHT);
  img.setAttribute('width', Maze.DIRT_WIDTH * Maze.DIRT_COUNT);
  img.setAttribute('clip-path', 'url(#dirtClip' + index + ')');
  img.setAttribute('id', 'dirt' + index);
  svg.insertBefore(img, pegmanIcon);
};

/**
 * Set the image based on the amount of dirt at the location.
 * @param {number} row Row index.
 * @param {number} col Column index.
 */
var updateDirt = function(row, col) {
  // Calculate spritesheet index.
  var n = Maze.dirt_[row][col];
  var spriteIndex;
  if (n < -Maze.DIRT_MAX) {
    spriteIndex = 0;
  } else if (n < 0) {
    spriteIndex = Maze.DIRT_MAX + n + 1;
  } else if (n > Maze.DIRT_MAX) {
    spriteIndex = Maze.DIRT_COUNT - 1;
  } else if (n > 0) {
    spriteIndex = Maze.DIRT_MAX + n;
  } else {
    throw new Error('Expected non-zero dirt.');
  }
  // Update dirt icon & clip path.
  var dirtIndex = dirtPositionToIndex(row, col);
  var img = document.getElementById('dirt' + dirtIndex);
  var x = Maze.SQUARE_SIZE * (col - spriteIndex + 0.5) - Maze.DIRT_HEIGHT / 2;
  var y = Maze.SQUARE_SIZE * (row + 0.5) - Maze.DIRT_WIDTH / 2;
  img.setAttribute('x', x);
  img.setAttribute('y', y);
};

var removeDirt = function(row, col) {
  var svg = document.getElementById('svgMaze');
  var index = dirtPositionToIndex(row, col);
  var img = document.getElementById('dirt' + index);
  if (img) {
    svg.removeChild(img);
  }
  var clip = document.getElementById('dirtClip' + index);
  if (clip) {
    svg.removeChild(clip);
  }
};

/**
  * Create sprite assets for pegman.
  * @param options Specify different features of the pegman animation.
  * idStr required identifier for the pegman.
  * pegmanImage required which image to use for the animation.
  * col which column the pegman is at.
  * row which row the pegman is at.
  * direction which direction the pegman is facing at.
  * rowIdx which column of the pegman the animation needs, default is 0.
  * numColPegman number of the pegman in each row, default is 4.
  * numRowPegman number of the pegman in each column, default is 1.
  */
var createPegmanAnimation = function(options) {
  var svg = document.getElementById('svgMaze');
  // Create clip path.
  var clip = document.createElementNS(Blockly.SVG_NS, 'clipPath');
  clip.setAttribute('id', options.idStr + 'PegmanClip');
  var rect = document.createElementNS(Blockly.SVG_NS, 'rect');
  rect.setAttribute('id', options.idStr + 'PegmanClipRect');
  if (options.col !== undefined) {
    rect.setAttribute('x', options.col * Maze.SQUARE_SIZE + 1);
  }
  if (options.row !== undefined) {
    rect.setAttribute(
        'y',
        Maze.SQUARE_SIZE * (options.row + 0.5) - Maze.PEGMAN_HEIGHT / 2 - 8);
  }
  rect.setAttribute('width', Maze.PEGMAN_WIDTH);
  rect.setAttribute('height', Maze.PEGMAN_HEIGHT);
  clip.appendChild(rect);
  svg.appendChild(clip);
  // Create image.
  var img = document.createElementNS(Blockly.SVG_NS, 'image');
  img.setAttributeNS(
      'http://www.w3.org/1999/xlink', 'xlink:href', options.pegmanImage);
  img.setAttribute('height', Maze.PEGMAN_HEIGHT * (options.numRowPegman || 1));
  img.setAttribute('width', Maze.PEGMAN_WIDTH * (options.numColPegman || 4));
  img.setAttribute('clip-path', 'url(#' + options.idStr + 'PegmanClip)');
  img.setAttribute('id', options.idStr + 'Pegman');
  svg.appendChild(img);
  // Update pegman icon & clip path.
  if (options.col !== undefined && options.direction !== undefined) {
    var x = Maze.SQUARE_SIZE * options.col -
        options.direction * Maze.PEGMAN_WIDTH + 1;
    img.setAttribute('x', x);
  }
  if (options.row !== undefined) {
    var y = Maze.SQUARE_SIZE * (options.row + 0.5) -
      (options.rowIdx || 0) * Maze.PEGMAN_HEIGHT -
      Maze.PEGMAN_HEIGHT / 2 - 8;
    img.setAttribute('y', y);
  }
};

/**
  * Update sprite assets for pegman.
  * @param options Specify different features of the pegman animation.
  * idStr required identifier for the pegman.
  * col required which column the pegman is at.
  * row required which row the pegman is at.
  * direction required which direction the pegman is facing at.
  * rowIdx which column of the pegman the animation needs, default is 0.
  */
var updatePegmanAnimation = function(options) {
  var rect = document.getElementById(options.idStr + 'PegmanClipRect');
  rect.setAttribute('x', options.col * Maze.SQUARE_SIZE + 1);
  rect.setAttribute(
      'y',
      Maze.SQUARE_SIZE * (options.row + 0.5) - Maze.PEGMAN_HEIGHT / 2 - 8);
  var img = document.getElementById(options.idStr + 'Pegman');
  var x = Maze.SQUARE_SIZE * options.col -
      options.direction * Maze.PEGMAN_WIDTH + 1;
  img.setAttribute('x', x);
  var y = Maze.SQUARE_SIZE * (options.row + 0.5) -
      (options.rowIdx || 0) * Maze.PEGMAN_HEIGHT -
      Maze.PEGMAN_HEIGHT / 2 - 8;
  img.setAttribute('y', y);
  img.setAttribute('visibility', 'visible');
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
    finishIcon.setAttribute('y', Maze.SQUARE_SIZE * (Maze.finish_.y + 0.9) -
        finishIcon.getAttribute('height'));
    finishIcon.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
                              skin.goal);
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

  // Reset pegman's visibility.
  var pegmanIcon = document.getElementById('pegman');
  if (skin.idlePegmanAnimation) {
    pegmanIcon.setAttribute('visibility', 'hidden');
    var idlePegmanIcon = document.getElementById('idlePegman');
    idlePegmanIcon.setAttribute('visibility', 'visible');
  } else {
    pegmanIcon.setAttribute('visibility', 'visible');
  }

  if (skin.wallPegmanAnimation) {
    var wallPegmanIcon = document.getElementById('wallPegman');
    wallPegmanIcon.setAttribute('visibility', 'hidden');
  }

  if (skin.movePegmanAnimation) {
    var movePegmanIcon = document.getElementById('movePegman');
    movePegmanIcon.setAttribute('visibility', 'hidden');
  }

  // Move the init dirt marker icons into position.
  resetDirt();
  for (var row = 0; row < Maze.ROWS; row++) {
    for (var col = 0; col < Maze.COLS; col++) {
      removeDirt(row, col);
      if (getTile(Maze.dirt_, col, row) !== 0 &&
          getTile(Maze.dirt_, col, row) !== undefined) {
        createDirt(row, col);
        updateDirt(row, col);
      }
    }
  }

  // Reset the obstacle image.
  var obsId = 0;
  var x, y;
  for (y = 0; y < Maze.ROWS; y++) {
    for (x = 0; x < Maze.COLS; x++) {
      var obsIcon = document.getElementById('obstacle' + obsId);
      if (obsIcon) {
        obsIcon.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
                               skin.obstacle);
      }
      ++obsId;
    }
  }

  // Reset the tiles
  var tileId = 0;
  for (y = 0; y < Maze.ROWS; y++) {
    for (x = 0; x < Maze.COLS; x++) {
      // Tile's clipPath element.
      var tileClip = document.getElementById('tileClipPath' + tileId);
      tileClip.setAttribute('visibility', 'visible');
      // Tile sprite.
      var tileElement = document.getElementById('tileElement' + tileId);
      tileElement.setAttributeNS(
          'http://www.w3.org/1999/xlink', 'xlink:href', skin.tiles);
      tileElement.setAttribute('opacity', 1);
      tileId++;
    }
  }

};

/**
 * Click the run button.  Start the program.
 */
// XXX This is the only method used by the templates!
BlocklyApps.runButtonClick = function() {
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

/**
 * App specific displayFeedback function that calls into
 * BlocklyApps.displayFeedback when appropriate
 */
var displayFeedback = function() {
  if (!Maze.waitingForReport && !Maze.waitingForAnimate) {
    BlocklyApps.displayFeedback({
      app: 'maze', //XXX
      skin: skin.id,
      feedbackType: Maze.testResults,
      response: Maze.response,
      level: level
    });
  }
};

/**
 * Function to be called when the service report call is complete
 * @param {object} JSON response (if available)
 */
Maze.onReportComplete = function(response) {
  Maze.response = response;
  Maze.waitingForReport = false;
  displayFeedback();
};

/**
 * Execute the user's code.  Heaven help us...
 */
Maze.execute = function() {
  BlocklyApps.log = [];
  BlocklyApps.ticks = 100; //TODO: Set higher for some levels
  var code = Blockly.Generator.workspaceToCode('JavaScript');
  Maze.result = ResultType.UNSET;
  Maze.testResults = BlocklyApps.TestResults.NO_TESTS_RUN;
  Maze.waitingForReport = false;
  Maze.waitingForAnimate = false;
  Maze.response = null;

  // Check for empty top level blocks to warn user about bugs,
  // especially ones that lead to infinite loops.
  if (feedback.hasEmptyTopLevelBlocks()) {
    Maze.testResults = BlocklyApps.TestResults.EMPTY_BLOCK_FAIL;
    displayFeedback();
    return;
  }

  if (level.editCode) {
    var codeTextbox = document.getElementById('codeTextbox');
    code = dom.getText(codeTextbox);
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
  BlocklyApps.playAudio('start', {volume : 0.5});
  try {
    codegen.evalWith(code, {
      BlocklyApps: BlocklyApps,
      Maze: api
    });
    Maze.checkSuccess();
    // If did not finish, shedule a failure.
    BlocklyApps.log.push(['finish', null]);
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

  if (level.failForOther1Star && !BlocklyApps.levelComplete) {
    Maze.testResults = BlocklyApps.TestResults.OTHER_1_STAR_FAIL;
  }

  var xml = Blockly.Xml.workspaceToDom(Blockly.mainWorkspace);
  var textBlocks = Blockly.Xml.domToText(xml);

  Maze.waitingForReport = true;
  Maze.waitingForAnimate = true;

  // Report result to server.
  BlocklyApps.report({
    app: 'maze',
    level: level.id,
    result: Maze.result === ResultType.SUCCESS,
    testResult: Maze.testResults,
    program: encodeURIComponent(textBlocks),
    onComplete: Maze.onReportComplete
  });

  // BlocklyApps.log now contains a transcript of all the user's actions.
  // Reset the maze and animate the transcript.
  BlocklyApps.reset(false);


  // Removing the idle animation and replace with pegman sprite
  if (skin.idlePegmanAnimation) {
    var pegmanIcon = document.getElementById('pegman');
    var idlePegmanIcon = document.getElementById('idlePegman');
    idlePegmanIcon.setAttribute('visibility', 'hidden');
    pegmanIcon.setAttribute('visibility', 'visible');
  }

  // Speeding up specific levels
  var scaledStepSpeed =
      stepSpeed * Maze.scale.stepSpeed * skin.movePegmanAnimationSpeedScale;
  Maze.pidList.push(window.setTimeout(Maze.animate,scaledStepSpeed));
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
      Maze.waitingForAnimate = false;
      displayFeedback();
    } else {
      window.setTimeout(function() {
        Maze.waitingForAnimate = false;
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
          Maze.pidList.push(window.setTimeout(function() {
            BlocklyApps.playAudio('failure', {volume: 0.5});
          }, stepSpeed));
          break;
      }
      break;
    case 'putdown':
      Maze.scheduleFill();
      break;
    case 'pickup':
      Maze.scheduleDig();
      break;
    case 'tile_transparent':
      Maze.setTileTransparent();
      break;
    default:
      // action[0] is null if generated by BlocklyApps.checkTimeout().
      break;
  }

  // Speeding up specific levels
  var scaledStepSpeed =
      stepSpeed * Maze.scale.stepSpeed * skin.movePegmanAnimationSpeedScale;
  Maze.pidList.push(window.setTimeout(Maze.animate, scaledStepSpeed));
};

/**
 * Schedule the animations for a move or turn.
 * @param {!Array.<number>} startPos X, Y and direction starting points.
 * @param {!Array.<number>} endPos X, Y and direction ending points.
 */
Maze.schedule = function(startPos, endPos) {
  function updateMoveFrame(frameIdx) {
    Maze.pidList.push(window.setTimeout(function() {
      pegmanIcon.setAttribute('visibility', 'hidden');
      updatePegmanAnimation({
        idStr: 'move',
        col: startPos[0] + deltaX * frameIdx,
        row: startPos[1] + deltaY * frameIdx,
        direction: direction,
        rowIdx: frameIdx
      });
    }, stepSpeed * 6 / numFrames * frameIdx));
  }

  var deltaX, deltaY, deltaDirection, numFrames;
  if (skin.movePegmanAnimation && endPos[2] - startPos[2] === 0) {
    // If move animation of pegman is set, and this is not a turn.
    // Show the animation.
    var pegmanIcon = document.getElementById('pegman');
    var movePegmanIcon = document.getElementById('movePegman');

    numFrames = skin.movePegmanAnimationFrameNumber;
    deltaX = (endPos[0] - startPos[0]) / numFrames;
    deltaY = (endPos[1] - startPos[1]) / numFrames;
    deltaDirection = (endPos[2] - startPos[2]) / numFrames;
    var direction = startPos[2] / 4;
    var frameIdx;

    for (frameIdx = 0; frameIdx < numFrames; frameIdx++) {
      updateMoveFrame(frameIdx);
    }

    // Hide movePegman and set pegman to the end position.
    Maze.pidList.push(window.setTimeout(function() {
      movePegmanIcon.setAttribute('visibility', 'hidden');
      pegmanIcon.setAttribute('visibility', 'visible');
      Maze.displayPegman(endPos[0], endPos[1],
                         Maze.constrainDirection16(endPos[2]));
    }, stepSpeed * 6 / numFrames * frameIdx));
  } else {
    numFrames = 4;
    deltaX = (endPos[0] - startPos[0]) / numFrames;
    deltaY = (endPos[1] - startPos[1]) / numFrames;
    deltaDirection = (endPos[2] - startPos[2]) / numFrames;
    Maze.displayPegman(startPos[0] + deltaX,
                       startPos[1] + deltaY,
                       Maze.constrainDirection16(startPos[2] + deltaDirection));
    Maze.pidList.push(window.setTimeout(function() {
        Maze.displayPegman(
            startPos[0] + deltaX * 2,
            startPos[1] + deltaY * 2,
            Maze.constrainDirection16(startPos[2] + deltaDirection * 2));
    }, stepSpeed));
    Maze.pidList.push(window.setTimeout(function() {
        Maze.displayPegman(
            startPos[0] + deltaX * 3,
            startPos[1] + deltaY * 3,
            Maze.constrainDirection16(startPos[2] + deltaDirection * 3));
    }, stepSpeed * 2));
      Maze.pidList.push(window.setTimeout(function() {
          Maze.displayPegman(endPos[0], endPos[1],
                             Maze.constrainDirection16(endPos[2]));
    }, stepSpeed * 3));
  }

  if (skin.approachingGoalAnimation) {
    var finishIcon = document.getElementById('finish');
    // If pegman is close to the goal
    // Replace the goal file with approachingGoalAnimation
    if (Maze.finish_ && Math.abs(endPos[0] - Maze.finish_.x) <= 1 &&
        Math.abs(endPos[1] - Maze.finish_.y) <= 1) {
      finishIcon.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
                                skin.approachingGoalAnimation);
    } else {
      finishIcon.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
                                skin.goal);
    }
  }
};

/**
 * Replace the tiles surronding the obstacle with broken tiles.
 */
Maze.updateSurroundingTiles = function(obstacleY, obstacleX, brokenTiles) {
  var tileCoords = [
    [obstacleY - 1, obstacleX - 1],
    [obstacleY - 1, obstacleX],
    [obstacleY - 1, obstacleX + 1],
    [obstacleY, obstacleX - 1],
    [obstacleY, obstacleX],
    [obstacleY, obstacleX + 1],
    [obstacleY + 1, obstacleX - 1],
    [obstacleY + 1, obstacleX],
    [obstacleY + 1, obstacleX + 1]
  ];
  for (var idx = 0; idx < tileCoords.length; ++idx) {
    var tileIdx = tileCoords[idx][1] + Maze.COLS * tileCoords[idx][0];
    var tileElement = document.getElementById('tileElement' + tileIdx);
    if (tileElement) {
      tileElement.setAttributeNS(
          'http://www.w3.org/1999/xlink', 'xlink:href', brokenTiles);
    }
  }
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
      deltaY = -1;
      break;
    case Direction.EAST:
      deltaX = 1;
      break;
    case Direction.SOUTH:
      deltaY = 1;
      break;
    case Direction.WEST:
      deltaX = -1;
      break;
  }
  if (!forward) {
    deltaX = -deltaX;
    deltaY = -deltaY;
  }

  var targetX = Maze.pegmanX + deltaX;
  var targetY = Maze.pegmanY + deltaY;
  var direction16 = Maze.constrainDirection16(Maze.pegmanD * 4);
  Maze.displayPegman(Maze.pegmanX + deltaX / 4,
                     Maze.pegmanY + deltaY / 4,
                     direction16);
  // Play sound and animation for hitting wall or obstacle
  var squareType = Maze.map[targetY] && Maze.map[targetY][targetX];
  if (squareType === SquareType.WALL || squareType === undefined) {
    // Play the sound
    BlocklyApps.playAudio('wall', {volume : 0.5});
    if (squareType !== undefined) {
      // Check which type of wall pegman is hitting
      BlocklyApps.playAudio('wall' + Maze.wallMap[targetY][targetX],
                            {volume : 0.5});
    }

    // Play the animation of hitting the wall
    if (skin.hittingWallAnimation) {
      Maze.pidList.push(window.setTimeout(function() {
        var wallAnimationIcon = document.getElementById('wallAnimation');
        wallAnimationIcon.setAttribute(
            'x',
            Maze.SQUARE_SIZE * (Maze.pegmanX + 0.5 + deltaX * 0.5) -
            wallAnimationIcon.getAttribute('width') / 2);
        wallAnimationIcon.setAttribute(
            'y',
            Maze.SQUARE_SIZE * (Maze.pegmanY + 1 + deltaY * 0.5) -
            wallAnimationIcon.getAttribute('height'));
        wallAnimationIcon.setAttributeNS(
          'http://www.w3.org/1999/xlink', 'xlink:href',
          skin.hittingWallAnimation);
      }, stepSpeed / 2));
    }
    Maze.pidList.push(window.setTimeout(function() {
      Maze.displayPegman(Maze.pegmanX,
                         Maze.pegmanY,
                         direction16);
    }, stepSpeed));
    Maze.pidList.push(window.setTimeout(function() {
      Maze.displayPegman(Maze.pegmanX + deltaX / 4,
                         Maze.pegmanY + deltaY / 4,
                         direction16);
      BlocklyApps.playAudio('failure', {volume : 0.5});
    }, stepSpeed * 2));
    Maze.pidList.push(window.setTimeout(function() {
      Maze.displayPegman(Maze.pegmanX, Maze.pegmanY, direction16);
    }, stepSpeed * 3));
    if (skin.wallPegmanAnimation) {
      Maze.pidList.push(window.setTimeout(function() {
        var pegmanIcon = document.getElementById('pegman');
        pegmanIcon.setAttribute('visibility', 'hidden');
        updatePegmanAnimation({
          idStr: 'wall',
          row: Maze.pegmanY,
          col: Maze.pegmanX,
          direction: Maze.pegmanD
        });
      }, stepSpeed * 4));
    }
  } else if (squareType == SquareType.OBSTACLE) {
    // Play the sound
    BlocklyApps.playAudio('obstacle', {volume : 0.5});

    // Play the animation
    var obsId = targetX + Maze.COLS * targetY;
    var obsIcon = document.getElementById('obstacle' + obsId);
    obsIcon.setAttributeNS(
        'http://www.w3.org/1999/xlink', 'xlink:href',
        skin.obstacleAnimation);
    Maze.pidList.push(window.setTimeout(function() {
      Maze.displayPegman(Maze.pegmanX + deltaX / 2,
                         Maze.pegmanY + deltaY / 2,
                         direction16);
    }, stepSpeed));

    // Replace the objects around obstacles with broken objects
    if (skin.largerObstacleAnimationTiles) {
      Maze.pidList.push(window.setTimeout(function() {
        Maze.updateSurroundingTiles(
            targetY, targetX, skin.largerObstacleAnimationTiles);
      }, stepSpeed));
    }

    // Remove pegman
    if (!skin.nonDisappearingPegmanHittingObstacle) {
      var svgMaze = document.getElementById('svgMaze');
      var pegmanIcon = document.getElementById('pegman');

      Maze.pidList.push(window.setTimeout(function() {
        pegmanIcon.setAttribute('visibility', 'hidden');
      }, stepSpeed * 2));
    }
  }

  Maze.pidList.push(window.setTimeout(function() {
    BlocklyApps.playAudio('failure', {volume : 0.5});
  }, stepSpeed));
};

/**
 * Set the tiles to be transparent gradually.
 */
Maze.setTileTransparent = function() {
  var tileId = 0;
  for (var y = 0; y < Maze.ROWS; y++) {
    for (var x = 0; x < Maze.COLS; x++) {
      // Tile sprite.
      var tileElement = document.getElementById('tileElement' + tileId);
      var tileAnimation = document.getElementById('tileAnimation' + tileId);
      if (tileElement) {
        tileElement.setAttribute('opacity', 0);
      }
      if (tileAnimation) {
        tileAnimation.beginElement();
      }
      tileId++;
    }
  }
};

/**
 * Schedule the animations and sound for a victory dance.
 * @param {boolean} sound Play the victory sound.
 */
Maze.scheduleFinish = function(sound) {
  var direction16 = Maze.constrainDirection16(Maze.pegmanD * 4);
  Maze.displayPegman(Maze.pegmanX, Maze.pegmanY, 16);

  // Setting the tiles to be transparent
  if (sound && skin.transparentTileEnding) {
    BlocklyApps.log.push(['tile_transparent', null]);
  }

  // If sound == true, play the goal animation, else reset it
  var finishIcon = document.getElementById('finish');
  if (sound && finishIcon) {
    BlocklyApps.playAudio('winGoal', {volumne : 0.5});
    finishIcon.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
                              skin.goalAnimation);
  }

  if (sound) {
    BlocklyApps.playAudio('win', {volume : 0.5});
  }
  stepSpeed = 150;  // Slow down victory animation a bit.
  Maze.pidList.push(window.setTimeout(function() {
    Maze.displayPegman(Maze.pegmanX, Maze.pegmanY, 18);
  }, stepSpeed));
  Maze.pidList.push(window.setTimeout(function() {
    Maze.displayPegman(Maze.pegmanX, Maze.pegmanY, 20);
  }, stepSpeed * 2));
  Maze.pidList.push(window.setTimeout(function() {
    Maze.displayPegman(Maze.pegmanX, Maze.pegmanY, 18);
  }, stepSpeed * 3));
  Maze.pidList.push(window.setTimeout(function() {
    Maze.displayPegman(Maze.pegmanX, Maze.pegmanY, 20);
  }, stepSpeed * 4));
  Maze.pidList.push(window.setTimeout(function() {
    Maze.displayPegman(Maze.pegmanX, Maze.pegmanY, direction16);
  }, stepSpeed * 5));
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

var scheduleDirtChange = function(options) {
  var col = Maze.pegmanX;
  var row = Maze.pegmanY;
  var previous = Maze.dirt_[row][col];
  var current = previous + options.amount;
  Maze.dirt_[row][col] = current;
  if (previous === 0 && current !== 0) {
    createDirt(row, col);
  }
  if (current === 0) {
    removeDirt(row, col);
  } else {
    updateDirt(row, col);
  }
  BlocklyApps.playAudio(options.sound, {volume: 0.5});
};

/**
 * Schedule to add dirt at pegman's current position.
 */
Maze.scheduleFill = function() {
  scheduleDirtChange({
    amount: 1,
    sound: 'fill'
  });
};

/**
 * Schedule to remove dirt at pegman's current location.
 */
Maze.scheduleDig = function() {
  scheduleDirtChange({
    amount: -1,
    sound: 'dig'
  });
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
  return false;
};
