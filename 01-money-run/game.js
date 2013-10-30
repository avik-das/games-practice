var SCREEN_WIDTH = 320;
var SCREEN_HEIGHT = 240;

var TILE_SIZE = 20;
var PLAYER_WIDTH = 20;
var PLAYER_HEIGHT = 28;

var IMG_OFFSET_TILE = 0;
var IMG_OFFSET_PLAYER = TILE_SIZE;
var IMG_OFFSET_MONEY = IMG_OFFSET_PLAYER + PLAYER_HEIGHT;

var LEVEL_WIDTH = SCREEN_WIDTH + TILE_SIZE * 2;
var PLAYER_START_OFFSET = TILE_SIZE * 3;

var NUM_INTRO_TILES = 10;
var MAX_COL_HEIGHT = SCREEN_HEIGHT / TILE_SIZE - 2;
var MAX_COL_DELTA = 4;
var MIN_COL_HEIGHT = 1;

var MONEY_SIZE = TILE_SIZE;
var MONEY_PROBABILITY = 0.1;
var MONEY_SCORE = 100;

var SCORE_DELTA_PER_FRAME = 0.25;
var SCORE_FONT_SIZE = 16;
var SCORE_PADDING = 4;
var GAME_OVER_SCORE_Y = 205;

var JUMP_VELOCITY = -40;
var GRAVITY_ACCELERATION = 9.8;

function clearCanvas(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

function drawScreen(ctx, n, state) {
  ctx.drawImage(state.images.screens,
    0, SCREEN_HEIGHT * n, SCREEN_WIDTH, SCREEN_HEIGHT,
    0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
}

function loadImage(src) {
  return new Promise(function(resolve, reject) {
    var img = new Image();

    img.addEventListener('error', reject);

    img.addEventListener('load', function(evt) {
      resolve(evt.target);
    });

    img.src = src;
  });
}

function loadImages() {
  return Promise.all([
    loadImage('tiles.png'),
    loadImage('screens.png')
  ]).spread(function(
    tiles,
    screens
  ) {
    return {
      tiles: tiles,
      screens: screens
    };
  });
}

function initScreen() {
  return new Promise(function(resolve, reject) {
    var screen = document.createElement('canvas');
    screen.width = SCREEN_WIDTH;
    screen.height = SCREEN_HEIGHT;

    document.getElementById('game').appendChild(screen);

    resolve(screen.getContext('2d'));
  });
}

function drawRandomLevelColumn(levelCtx, col, state, options) {
  var height;
  if (options && options.height) {
    height = options.height;
  } else {
    var lastHeight = state.heights[state.heights.length - 1];
    var maxColHeight = Math.min(lastHeight + MAX_COL_DELTA,
      MAX_COL_HEIGHT);
    height = Math.floor(Math.random() * maxColHeight) + MIN_COL_HEIGHT;
  }

  for (var y = 0; y < height; y++) {
    var dy = SCREEN_HEIGHT - TILE_SIZE - TILE_SIZE * y;
    levelCtx.drawImage(state.images.tiles,
      0, IMG_OFFSET_TILE, TILE_SIZE, TILE_SIZE,
      col * TILE_SIZE, dy, TILE_SIZE, TILE_SIZE);
  }

  // only place money if the height is not pre-determined
  var hasMoney = !(options && options.height) &&
    Math.random() < MONEY_PROBABILITY;
  if (hasMoney) {
    var dy = SCREEN_HEIGHT - TILE_SIZE - TILE_SIZE * height;
    levelCtx.drawImage(state.images.tiles,
      0, IMG_OFFSET_MONEY, TILE_SIZE, TILE_SIZE,
      col * MONEY_SIZE, dy, TILE_SIZE, TILE_SIZE);
  }

  state.heights.push(height);
  state.hasMoneys.push(hasMoney);
}

function initLevel(state) {
  return new Promise(function(resolve, reject) {
    var level = document.createElement('canvas');
    level.width = LEVEL_WIDTH;
    level.height = SCREEN_HEIGHT;

    var levelCtx = level.getContext('2d');

    var options = {};
    for (var x = 0; x < LEVEL_WIDTH / TILE_SIZE; x++) {
      options.height = (x === 1 || x < NUM_INTRO_TILES) ? 1 : 0;
      drawRandomLevelColumn(levelCtx, x, state, options);
    }

    var scratchLevel = document.createElement('canvas');
    scratchLevel.width = LEVEL_WIDTH;
    scratchLevel.height = SCREEN_HEIGHT;
    state.scratchLevel = scratchLevel.getContext('2d');

    resolve(levelCtx);
  });
}

function getColumnIndexAt(x, state) {
  return Math.floor((x + state.levelX) / TILE_SIZE);
}

function getColumnTopAt(x, state) {
  var col = getColumnIndexAt(x, state);
  var height = state.heights[col];
  return SCREEN_HEIGHT - height * TILE_SIZE;
}

function hasMoneyAt(x, state) {
  var col = getColumnIndexAt(x, state);
  return state.hasMoneys[col];
}

function isGrounded(state) {
  var player = state.player;

  var possibleColumns = [];
  possibleColumns.push(getColumnTopAt(player.x, state));
  possibleColumns.push(getColumnTopAt(player.x + PLAYER_WIDTH - 1, state));

  var grounded = false;
  possibleColumns.forEach(function(height) {
    if (player.y + PLAYER_HEIGHT >= height) {
      grounded = height;
    }
  });

  return grounded;
}

function willIntersectBoxes(proposedX, state) {
  var player = state.player;

  var height = getColumnTopAt(proposedX, state);
  if (player.y + PLAYER_HEIGHT > height) {
    return true;
  }

  return false;
}

function applyForces(state, dt) {
  var player = state.player;

  if (willIntersectBoxes(player.x + PLAYER_WIDTH - 1, state)) {
    player.x--;
  }

  player.y += player.v * dt / 1e13;

  var columnHeight = isGrounded(state);
  if (columnHeight) {
    player.y = columnHeight - PLAYER_HEIGHT;
    player.v = 0;
    return;
  }

  player.v += 9.8 * dt / 1e13;
}

function grabMoneyUnderPlayer(levelCtx, state) {
  var player = state.player;

  var possibleXs = [];
  possibleXs.push(player.x);
  possibleXs.push(player.x + PLAYER_WIDTH - 1);

  possibleXs.forEach(function(x) {
    if (!hasMoneyAt(x, state)) {
      return;
    }

    var col = getColumnIndexAt(x, state);

    var moneyBottomY = getColumnTopAt(x, state);
    var moneyTopY = moneyBottomY - MONEY_SIZE;

    var playerTopY = player.y;
    var playerBottomY = player.y + PLAYER_HEIGHT - 1;

    if (
      (playerTopY <= moneyTopY && playerBottomY >= moneyTopY) ||
      (playerBottomY >= moneyBottomY && playerTopY <= moneyBottomY)
    ) {
      state.hasMoneys[col] = false;
      levelCtx.clearRect(col * TILE_SIZE, moneyTopY, TILE_SIZE, TILE_SIZE);
      state.score += MONEY_SCORE;
    }
  });
}

function updateLevelIfNecessary(levelCtx, state) {
  if (state.levelX !== TILE_SIZE) {
    return;
  }

  // 1. clear scratch level
  clearCanvas(state.scratchLevel, LEVEL_WIDTH, SCREEN_HEIGHT);

  // 2. blit level -> scratch level
  state.scratchLevel.drawImage(levelCtx.canvas,
    state.levelX, 0, LEVEL_WIDTH - TILE_SIZE, SCREEN_HEIGHT,
    0, 0, LEVEL_WIDTH - TILE_SIZE, SCREEN_HEIGHT);

  // 3. clear level
  clearCanvas(levelCtx, LEVEL_WIDTH, SCREEN_HEIGHT);

  // 4. blit scratch level -> level
  levelCtx.drawImage(state.scratchLevel.canvas,
    0, 0, LEVEL_WIDTH - TILE_SIZE, SCREEN_HEIGHT,
    0, 0, LEVEL_WIDTH - TILE_SIZE, SCREEN_HEIGHT);

  drawRandomLevelColumn(levelCtx, (LEVEL_WIDTH - TILE_SIZE) / TILE_SIZE,
    state);

  state.heights.shift();
  state.hasMoneys.shift();
  state.levelX = 0;
}

function renderScreen(screenCtx, levelCtx, state) {
  drawScreen(screenCtx, 0, state);
  screenCtx.drawImage(levelCtx.canvas,
    state.levelX, 0, SCREEN_WIDTH, SCREEN_HEIGHT,
    0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  screenCtx.drawImage(state.images.tiles,
    0, IMG_OFFSET_PLAYER, PLAYER_WIDTH, PLAYER_HEIGHT,
    state.player.x, state.player.y, PLAYER_WIDTH, PLAYER_HEIGHT);

  screenCtx.font = 'bold ' + SCORE_FONT_SIZE + 'px monospace';
  screenCtx.fillStyle = 'black';
  screenCtx.fillText(Math.floor(state.score), SCORE_PADDING,
    SCREEN_HEIGHT - SCORE_PADDING);
}

function isGameOver(state) {
  return state.player.x <= -PLAYER_WIDTH;
}

function renderGameOver(ctx, state) {
  drawScreen(ctx, 1, state);

  ctx.font = 'bold 25px monospace';
  ctx.fillStyle = 'rgb(128, 0, 0)';
  ctx.textAlign = 'center';
  ctx.fillText('score: ' + Math.floor(state.score), SCREEN_WIDTH / 2,
    GAME_OVER_SCORE_Y);
}

function getUpdateFunction(screenCtx, levelCtx, state) {
  return function update(lastFrameTime) {
    var time = Date.now();
    var dtime = time - lastFrameTime;

    applyForces(state, dtime);
    kd.tick();

    grabMoneyUnderPlayer(levelCtx, state);

    state.levelX++;
    state.player.x--;
    renderScreen(screenCtx, levelCtx, state);
    updateLevelIfNecessary(levelCtx, state);

    state.score += SCORE_DELTA_PER_FRAME;

    if (isGameOver(state)) {
      renderGameOver(screenCtx, state);
    } else {
      requestAnimationFrame(update);
    }
  }
}

window.onload = function() {
  var requestAnimationFrame = window.requestAnimationFrame ||
    window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame ||
    window.msRequestAnimationFrame;
  window.requestAnimationFrame = requestAnimationFrame;

  var state = {
    heights: [],
    hasMoneys: [],
    images: null,
    levelX: 0,
    score: 0,
    player: {
      x: PLAYER_START_OFFSET,
      y: 0,
      v: 0
    }
  };

  window.debug = {};
  window.debug.state = state;

  var images = loadImages();
  var level = images.then(function(images) {
    state.images = images;
    return initLevel(state);
  });

  Promise.all([images, initScreen(), level])
    .spread(function(images, screenCtx, levelCtx) {
      renderScreen(screenCtx, levelCtx, state);
      requestAnimationFrame(getUpdateFunction(screenCtx, levelCtx, state));

      kd.RIGHT.down(function() {
        if (state.player.x < SCREEN_WIDTH - PLAYER_WIDTH) {
          if (!willIntersectBoxes(state.player.x + PLAYER_WIDTH, state)) {
            state.player.x += 2;
          }
        }
      });

      kd.LEFT.down(function() {
        if (state.player.x > 0) {
          if (!willIntersectBoxes(state.player.x - 1, state)) {
            state.player.x--;
          }
        }
      });

      kd.SPACE.press(function() {
        if (isGrounded(state)) {
          state.player.v = JUMP_VELOCITY;
        }
      });
    });
};
