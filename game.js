/* Mini MOBA — прототип с простыми встроенными спрайтами. Phaser 3.90.0 */
(() => {
  'use strict';
  if (!window.Phaser) {
    document.getElementById('error').style.display = 'block';
    document.getElementById('error').textContent = 'Не удалось загрузить Phaser. Для первого запуска нужен интернет.';
    return;
  }

  const W = 1280, H = 720, LANE_Y = 355;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  class Battle extends Phaser.Scene {
    constructor() { super('Battle'); }

    preload() {
      this.load.image('art-map', window.MOBA_ASSETS['map']);
      for (const id of ['hero-warrior','hero-mage','hero-enemy','creep-blue','creep-red',
        'tower-blue','tower-red','fortress-blue','fortress-red','catapult']) {
        this.load.image('art-'+id, window.MOBA_ASSETS[id]);
      }
    }

    create() {
      this.cameras.main.setBackgroundColor('#153b2d');
      this.createTextures();
      this.drawMap();
      this.createHealingZone();

      this.elapsed = 0;
      this.clockStartedAt = null;
      this.leaderboard = window.MiniMobaLeaderboard;
      this.gold = 0;
      this.goldEarned = 0;
      this.creepKills = 0;
      this.heroKills = 0;
      this.towersDestroyed = 0;
      this.kills = 0;
      this.catapultsBought = 0;
      this.gameOver = false;
      this.choosingClass = true;
      this.className = '';
      this.entities = [];
      this.isPaused = false;
      this.enemyMode = 'Оборона';
      this.shopOpen = false;
      this.adTransition = false;
      this.lockedTarget = null;
      this.menuOpen = false;

      this.player = this.unit(285, LANE_Y + 60, 'hero', false, 240, 112, 'warrior');
      this.player.speed = 235;
      this.player.radius = 22;
      this.player.attackRange = 150;
      this.player.attackDamage = 25;
      this.player.attackCd = 560;
      this.player.nextAttack = 0;
      // Match the effective targeting distance in attack(): class range + 45 pixels.
      this.rangeVisible = true;
      this.attackRadius = this.add.circle(this.player.x, this.player.y, this.player.attackRange + 45, 0x5bbdff, 0.065)
        .setStrokeStyle(3, 0x8cdaff, .70).setDepth(2.5).setVisible(false);

      this.enemy = this.unit(960, LANE_Y - 36, 'enemy', true, 180, 65, 'enemy');
      this.enemy.speed = 72;
      this.enemy.radius = 21;
      this.enemy.attackRange = 102;
      this.enemy.attackDamage = 12;
      this.enemy.attackCd = 950;
      this.enemy.nextAttack = 0;

      // Towers are genuine units: high health, automatic attacks and destruction.
      this.towers = [
        this.unit(300, LANE_Y - 72, 'tower', false, 900, 0),
        this.unit(420, LANE_Y + 72, 'tower', false, 900, 0),
        this.unit(860, LANE_Y + 72, 'tower', true, 900, 0),
        this.unit(1000, LANE_Y - 72, 'tower', true, 900, 0)
      ];
      for (const tower of this.towers) {
        tower.attackRange = 215;
        tower.attackDamage = 48;
        tower.attackCd = 1100;
      }
      this.crystal = this.unit(1177, LANE_Y, 'crystal', true, 650, 0);
      this.crystal.radius = 34;

      this.topPanel = this.add.rectangle(640, 29, 1244, 54, 0x08231f, 0.58).setDepth(8);
      this.defaultStatus = 'Разрушь башни и вражескую крепость!';
      this.info = this.add.text(26, 15, '', {
        fontFamily: 'Arial', fontSize: 18, color: '#f9e7a6', fontStyle: 'bold'
      }).setDepth(9);
      this.status = this.add.text(640, 15, this.defaultStatus, {
        fontFamily: 'Arial', fontSize: 17, color: '#ffffff'
      }).setOrigin(.5, 0).setDepth(9);
      this.hpLabel = this.add.text(18, 688, '', {
        fontFamily: 'Arial', fontSize: 17, color: '#d5ffdf',
        backgroundColor: '#08231fcc', padding: { x: 10, y: 6 }
      }).setDepth(9);

      this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,R,V');
      this.input.keyboard.on('keydown-V', () => this.toggleAttackRadius());
      this.rangeButton = this.add.text(1238, 14, '◉ ДАЛЬН.', {
        fontFamily: 'Arial', fontSize: 13, color: '#b7ebff', backgroundColor: '#092a33',
        padding: { x: 8, y: 6 }
      }).setOrigin(1, 0).setDepth(12).setInteractive({ useHandCursor: true });
      this.rangeButton.on('pointerdown', () => this.toggleAttackRadius());
      this.input.keyboard.on('keydown-R', () => { if (this.gameOver) this.startNextMatch(); });
      this.input.keyboard.on('keydown-ESC', () => this.togglePause());
      this.input.keyboard.on('keydown-P', () => this.togglePause());
      this.input.keyboard.on('keydown-B', () => this.toggleShop());
      this.input.keyboard.on('keydown-M', () => this.toggleMainMenu());
      this.audio = window.MiniMobaSound;
      this.soundButton=this.add.text(1238, 59, this.audio?.muted()?'🔇 ЗВУК':'🔊 ЗВУК',{
        fontFamily:'Arial',fontSize:13,color:'#f0f5ff',
        backgroundColor:'#153e42',padding:{x:8,y:7}
      }).setOrigin(1,0).setDepth(42).setInteractive({useHandCursor:true});
      this.soundButton.on('pointerdown',()=>{
        const off=this.audio?.toggle();
        this.soundButton.setText(off?'🔇 ЗВУК':'🔊 ЗВУК');
      });
      this.input.keyboard.on('keydown-N',()=>{
        const off=this.audio?.toggle();
        this.soundButton.setText(off?'🔇 ЗВУК':'🔊 ЗВУК');
      });
      this.input.on('pointerdown',()=>this.audio?.unlock());
      this.buildPauseMenu();
      this.buildMainMenu();
      this.buildShop();
      this.targetMarker = this.add.circle(0,0,25,0xffe99c,0.08).setStrokeStyle(3,0xffec8c,.85).setDepth(5).setVisible(false);
      this.lockLabel=this.add.text(0,0,'ЦЕЛЬ',{fontFamily:'Arial',fontSize:13,fontStyle:'bold',color:'#ffe18e',backgroundColor:'#15352d',padding:{x:5,y:3}}).setOrigin(.5).setDepth(16).setVisible(false);
      this.addLeaderboardButton();

      this.input.on('pointerdown', p => {
        if(this.gameOver||this.choosingClass||this.shopOpen||this.menuOpen||this.isPaused)return;
        // Ignore joystick and attack button, allowing target selection on mouse/touch.
        if ((p.x<235&&p.y>490)||dist(p,{x:1107,y:630})<60||p.y<62)return;
        const hit=this.entities.filter(u=>this.alive(u)&&u.enemy&&u.type!=='crystal' ||
          (this.alive(u)&&u.enemy&&u.type==='crystal'))
          .map(u=>({u,d:dist(p,u)})).filter(v=>v.d<=Math.max(26,v.u.radius+18))
          .sort((a,b)=>a.d-b.d)[0];
        if(hit){
          this.lockedTarget=this.lockedTarget===hit.u?null:hit.u;
          this.status.setText(this.lockedTarget?'Цель захвачена!':'Захват снят');
        }
      });

      this.joy = { active: false, id: null, ox: 105, oy: 612, dx: 0, dy: 0 };
      this.joyBase = this.add.circle(105, 612, 63, 0x0a2232, .65).setStrokeStyle(4, 0xa1c4e1, .8);
      this.joyThumb = this.add.circle(105, 612, 26, 0x66b2e3, .8).setStrokeStyle(2, 0xf4ffff, 1);
      this.attackButton = this.makeButton(1107, 630, 49, 0xc0574c, '⚔');

      this.input.on('pointerdown', (p) => {
        if (p.x < 235 && p.y > 490) {
          this.joy.active = true;
          this.joy.id = p.id;
          this.joy.ox = 105;
          this.joy.oy = 612;
          this.moveJoy(p);
        } else if (dist(p, { x: 1107, y: 630 }) < 57) {
          this.attack(this.player);
        }
      });
      this.input.on('pointermove', p => {
        if (this.joy.active && p.id === this.joy.id) this.moveJoy(p);
      });
      this.input.on('pointerup', p => {
        if (p.id === this.joy.id) {
          this.joy.active = false;
          this.joy.dx = 0;
          this.joy.dy = 0;
          this.joyThumb.setPosition(105, 612);
        }
      });
      this.input.on('gameout', () => {
        this.joy.active = false;
        this.joy.dx = 0;
        this.joy.dy = 0;
        this.joyThumb.setPosition(105, 612);
      });

      this.spawnClock = this.time.addEvent({
        delay: 3800,
        callback: () => this.spawnCreep(),
        callbackScope: this,
        loop: true
      });
      this.time.delayedCall(800, () => this.spawnCreep());
      this.showClassSelection();
      this.registerLifecycle();
      window.MiniMobaSDK.ready();
      this.refreshGameState();
    }

    createTextures() {
      const g = this.make.graphics({ x: 0, y: 0, add: false });

      const makeWarrior = (key, armorColor, accentColor) => {
        g.clear();
        g.fillStyle(0x000000, 0.18).fillEllipse(32, 54, 34, 10);
        g.fillStyle(0xd7c2a4, 1).fillCircle(32, 16, 9);
        g.fillStyle(0x5a3d2a, 1).fillCircle(32, 10, 7);
        g.fillStyle(armorColor, 1).fillRoundedRect(20, 23, 24, 20, 6);
        g.fillStyle(accentColor, 1).fillRoundedRect(24, 26, 16, 12, 4);
        g.fillStyle(0x9fb4c7, 1).fillRect(45, 23, 5, 24);
        g.fillStyle(0xd9e3ec, 1).fillTriangle(50, 23, 60, 31, 50, 39);
        g.fillStyle(0x8d5a3a, 1).fillRect(43, 39, 4, 12);
        g.fillStyle(0x94b6d8, 1).fillCircle(15, 31, 9);
        g.lineStyle(3, 0xe6f2ff, 1).strokeCircle(15, 31, 9);
        g.fillStyle(armorColor, 1).fillRect(22, 43, 8, 13);
        g.fillStyle(armorColor, 1).fillRect(35, 43, 8, 13);
        g.fillStyle(0x3b2d23, 1).fillRect(21, 54, 9, 5);
        g.fillStyle(0x3b2d23, 1).fillRect(34, 54, 9, 5);
        g.generateTexture(key, 64, 64);
      };

      const makeMage = (key, robeColor, glowColor) => {
        g.clear();
        g.fillStyle(0x000000, 0.18).fillEllipse(32, 54, 32, 10);
        g.fillStyle(0xe3d2b9, 1).fillCircle(32, 16, 8);
        g.fillStyle(0x5c4264, 1).fillTriangle(23, 12, 41, 12, 32, 4);
        g.fillStyle(robeColor, 1).fillTriangle(17, 48, 47, 48, 32, 22);
        g.fillStyle(robeColor, 1).fillRoundedRect(23, 23, 18, 17, 5);
        g.fillStyle(0xc7b5ff, 1).fillRect(45, 19, 4, 24);
        g.fillStyle(glowColor, 1).fillCircle(47, 16, 6);
        g.lineStyle(2, 0xf7f1ff, .9).strokeCircle(47, 16, 7);
        g.fillStyle(0xd6c7ff, 1).fillRect(25, 47, 5, 10);
        g.fillStyle(0xd6c7ff, 1).fillRect(34, 47, 5, 10);
        g.fillStyle(0x45304c, 1).fillRect(24, 56, 7, 3);
        g.fillStyle(0x45304c, 1).fillRect(33, 56, 7, 3);
        g.generateTexture(key, 64, 64);
      };

      const makeEnemyHero = (key) => {
        g.clear();
        g.fillStyle(0x000000, 0.18).fillEllipse(32, 54, 34, 10);
        g.fillStyle(0xe8b59d, 1).fillCircle(32, 16, 9);
        g.fillStyle(0x4a1f1e, 1).fillCircle(32, 10, 7);
        g.fillStyle(0x8d3030, 1).fillRoundedRect(20, 23, 24, 20, 6);
        g.fillStyle(0xd97467, 1).fillRoundedRect(24, 26, 16, 12, 4);
        g.fillStyle(0x9099aa, 1).fillRect(45, 23, 5, 24);
        g.fillStyle(0xe4ebf4, 1).fillTriangle(50, 23, 60, 31, 50, 39);
        g.fillStyle(0x8d5a3a, 1).fillRect(43, 39, 4, 12);
        g.fillStyle(0xb64444, 1).fillCircle(15, 31, 9);
        g.lineStyle(3, 0xffe0d6, 1).strokeCircle(15, 31, 9);
        g.fillStyle(0x8d3030, 1).fillRect(22, 43, 8, 13);
        g.fillStyle(0x8d3030, 1).fillRect(35, 43, 8, 13);
        g.fillStyle(0x40251d, 1).fillRect(21, 54, 9, 5);
        g.fillStyle(0x40251d, 1).fillRect(34, 54, 9, 5);
        g.generateTexture(key, 64, 64);
      };

      const makeCreep = (key, bodyColor, accentColor) => {
        g.clear();
        g.fillStyle(0x000000, 0.18).fillEllipse(20, 32, 18, 7);
        g.fillStyle(0xe0caa8, 1).fillCircle(20, 10, 5);
        g.fillStyle(bodyColor, 1).fillRoundedRect(12, 15, 16, 12, 4);
        g.fillStyle(accentColor, 1).fillRect(13, 17, 14, 4);
        g.fillStyle(0xc4d0dc, 1).fillRect(30, 17, 3, 14);
        g.fillStyle(0xe3ebf5, 1).fillTriangle(33, 17, 39, 21, 33, 25);
        g.fillStyle(bodyColor, 1).fillRect(13, 26, 5, 9);
        g.fillStyle(bodyColor, 1).fillRect(22, 26, 5, 9);
        g.fillStyle(0x3f3026, 1).fillRect(12, 34, 6, 3);
        g.fillStyle(0x3f3026, 1).fillRect(21, 34, 6, 3);
        g.generateTexture(key, 40, 40);
      };

      const makeTower = (key, mainColor, flagColor) => {
        g.clear();
        g.fillStyle(0x000000, 0.2).fillEllipse(40, 92, 52, 12);
        g.fillStyle(0x8f8a80, 1).fillRoundedRect(23, 32, 34, 48, 6);
        g.fillStyle(mainColor, 1).fillRoundedRect(26, 36, 28, 40, 5);
        g.fillStyle(0xbeb8ab, 1).fillRect(18, 24, 44, 11);
        g.fillStyle(0xd8d1c1, 1).fillRect(14, 18, 10, 9);
        g.fillStyle(0xd8d1c1, 1).fillRect(27, 18, 10, 9);
        g.fillStyle(0xd8d1c1, 1).fillRect(43, 18, 10, 9);
        g.fillStyle(0x473529, 1).fillRoundedRect(33, 50, 14, 20, 4);
        g.fillStyle(0x6b5a47, 1).fillRoundedRect(35, 53, 10, 17, 3);
        g.fillStyle(0x8b7558, 1).fillRect(39, 1, 3, 18);
        g.fillStyle(flagColor, 1).fillTriangle(42, 4, 42, 14, 58, 9);
        g.generateTexture(key, 80, 100);
      };

      const makeFortress = (key, mainColor, accentColor) => {
        g.clear();
        g.fillStyle(0x000000, 0.22).fillEllipse(70, 112, 104, 14);
        g.fillStyle(0xb8b2a6, 1).fillRoundedRect(22, 48, 96, 48, 10);
        g.fillStyle(mainColor, 1).fillRoundedRect(28, 52, 84, 40, 8);
        g.fillStyle(0xcfc8b8, 1).fillRoundedRect(12, 32, 26, 58, 7);
        g.fillStyle(0xcfc8b8, 1).fillRoundedRect(102, 32, 26, 58, 7);
        g.fillStyle(mainColor, 1).fillRoundedRect(16, 36, 18, 50, 6);
        g.fillStyle(mainColor, 1).fillRoundedRect(106, 36, 18, 50, 6);
        g.fillStyle(0xded7c5, 1).fillRect(10, 24, 16, 10);
        g.fillStyle(0xded7c5, 1).fillRect(27, 24, 16, 10);
        g.fillStyle(0xded7c5, 1).fillRect(44, 40, 16, 10);
        g.fillStyle(0xded7c5, 1).fillRect(61, 40, 16, 10);
        g.fillStyle(0xded7c5, 1).fillRect(78, 40, 16, 10);
        g.fillStyle(0xded7c5, 1).fillRect(95, 24, 16, 10);
        g.fillStyle(0xded7c5, 1).fillRect(112, 24, 16, 10);
        g.fillStyle(0x564338, 1).fillRoundedRect(54, 63, 32, 33, 7);
        g.fillStyle(0x7b5d4c, 1).fillRoundedRect(58, 66, 24, 30, 5);
        g.fillStyle(0x745f4b, 1).fillRect(25, 10, 4, 18);
        g.fillStyle(0x745f4b, 1).fillRect(111, 10, 4, 18);
        g.fillStyle(accentColor, 1).fillTriangle(29, 12, 29, 23, 47, 18);
        g.fillStyle(accentColor, 1).fillTriangle(115, 12, 115, 23, 97, 18);
        g.generateTexture(key, 140, 120);
      };

      const makeCrystal = (key, fillColor, outlineColor) => {
        g.clear();
        g.fillStyle(0x000000, 0.2).fillEllipse(36, 60, 36, 10);
        g.fillStyle(fillColor, 0.20).fillCircle(36, 34, 23);
        g.lineStyle(3, outlineColor, 0.95);
        g.fillStyle(fillColor, 1);
        g.beginPath();
        g.moveTo(36, 8);
        g.lineTo(54, 25);
        g.lineTo(46, 52);
        g.lineTo(36, 62);
        g.lineTo(26, 52);
        g.lineTo(18, 25);
        g.closePath();
        g.fillPath();
        g.strokePath();
        g.fillStyle(0xffffff, 0.45).fillTriangle(31, 18, 38, 14, 35, 34);
        g.generateTexture(key, 72, 72);
      };

      makeWarrior('hero-warrior', 0x2f7bb6, 0x63c3ff);
      makeMage('hero-mage', 0x7a4fb3, 0xb993ff);
      makeEnemyHero('hero-enemy');
      makeCreep('creep-blue', 0x3476a7, 0x71c3ea);
      makeCreep('creep-red', 0x8a4038, 0xec8b71);
      makeTower('tower-blue', 0x2b6da0, 0x4fb3ff);
      makeTower('tower-red', 0x8a3d35, 0xff8670);
      makeFortress('fortress-blue', 0x2b6da0, 0x58bdff);
      makeFortress('fortress-red', 0x8a3d35, 0xff8c75);
      makeCrystal('crystal-red', 0xf34e68, 0xffccd6);
      makeCrystal('crystal-blue', 0x57c1ff, 0xe3f6ff);

      // A small, self-contained siege-engine sprite: no external image assets.
      g.clear();
      g.fillStyle(0x000000, .22).fillEllipse(46, 65, 70, 13);
      g.fillStyle(0x795438).fillRoundedRect(12, 37, 67, 16, 4);
      g.fillStyle(0xb48b58).fillRoundedRect(18, 29, 51, 12, 3);
      g.fillStyle(0x503829).fillCircle(22, 56, 13);
      g.fillStyle(0x503829).fillCircle(69, 56, 13);
      g.lineStyle(4, 0xd9b983).strokeCircle(22, 56, 9);
      g.lineStyle(4, 0xd9b983).strokeCircle(69, 56, 9);
      g.lineStyle(7, 0x7b4c30).lineBetween(45, 38, 65, 9);
      g.fillStyle(0xa2adb4).fillCircle(67, 8, 10);
      g.fillStyle(0x70bfed).fillTriangle(35, 26, 35, 9, 51, 18);
      g.generateTexture('catapult', 92, 76);

      g.destroy();
    }

    drawMap() {
      // A hand-painted cartoon fantasy arena with no baked-in gameplay buildings.
      // All functioning towers and bases are drawn only as Phaser entities.
      this.add.image(640,360,'art-map').setDisplaySize(W,H).setDepth(0);
    }

    createHealingZone() {
      // Exactly the same centre and radius as healAtBase(), so the ring is accurate.
      this.healingZone = this.add.circle(88, LANE_Y, 130, 0x5afa9c, 0.10)
        .setStrokeStyle(3, 0x79ffc0, 0.78).setDepth(1.1);
      this.tweens.add({
        targets: this.healingZone, alpha: { from: 0.65, to: 1 },
        duration: 1400, yoyo: true, repeat: -1
      });
      this.add.text(184, LANE_Y - 125, '✚ ЗОНА ЛЕЧЕНИЯ', {
        fontFamily: 'Arial', fontSize: 17, fontStyle: 'bold', color: '#c3ffe0',
        backgroundColor: '#123d32', padding: { x: 8, y: 5 }
      }).setOrigin(.5).setDepth(5);
    }

    showClassSelection() {
      const layer = this.add.container(0, 0).setDepth(100);
      const add = obj => { layer.add(obj); return obj; };

      add(this.add.rectangle(W / 2, H / 2, W, H, 0x071b20, .87));
      add(this.add.text(W / 2, 110, 'ВЫБЕРИ КЛАСС', {
        fontFamily: 'Arial', fontSize: 43, fontStyle: 'bold', color: '#f5e8b6'
      }).setOrigin(.5));
      add(this.add.text(W / 2, 164, 'Каждый класс обладает своими преимуществами', {
        fontFamily: 'Arial', fontSize: 20, color: '#d5e7e0'
      }).setOrigin(.5));

      const classes = [
        {
          id: 'warrior', name: 'ВОИН', x: 430, color: 0x2775aa, texture: 'art-hero-warrior',
          desc: ['Здоровье: 360', 'Урон атаки: 23', 'Атака: каждые 0.38 с', 'Дальность: 117']
        },
        {
          id: 'mage', name: 'МАГ', x: 850, color: 0x8050b8, texture: 'art-hero-mage',
          desc: ['Здоровье: 190', 'Урон атаки: 55', 'Атака: каждые 1.05 с', 'Дальность: 177']
        }
      ];

      for (const c of classes) {
        const card = add(this.add.rectangle(c.x, 385, 344, 350, 0x1d3440, .98)
          .setStrokeStyle(4, c.color)
          .setInteractive({ useHandCursor: true }));
        add(this.add.circle(c.x, 286, 48, 0x0f1e25, .92).setStrokeStyle(3, c.color));
        add(this.add.image(c.x, 286, c.texture).setDisplaySize(100,100));
        add(this.add.text(c.x, 358, c.name, {
          fontFamily: 'Arial', fontSize: 31, fontStyle: 'bold', color: '#ffffff'
        }).setOrigin(.5));
        c.desc.forEach((line, i) => add(this.add.text(c.x, 414 + i * 30, line, {
          fontFamily: 'Arial', fontSize: 19, color: '#e4f3ed'
        }).setOrigin(.5)));
        add(this.add.text(c.x, 535, 'ВЫБРАТЬ', {
          fontFamily: 'Arial', fontSize: 20, fontStyle: 'bold', color: '#ffeeb3'
        }).setOrigin(.5));
        card.on('pointerdown', () => this.selectClass(c.id, layer));
      }

      // Rules are always visible before a class is selected.
      add(this.add.rectangle(W / 2, 635, 1020, 122, 0x173441, .98)
        .setStrokeStyle(2, 0x7299a4, .8));
      add(this.add.text(W / 2, 587, 'ПРАВИЛА И НАГРАДЫ', {
        fontFamily: 'Arial', fontSize: 21, fontStyle: 'bold', color: '#ffe7a0'
      }).setOrigin(.5));
      add(this.add.text(W / 2, 617, 'Крип: +5 монет   •   Башня: +50 монет   •   Герой: +100 монет', {
        fontFamily: 'Arial', fontSize: 19, color: '#e4f3ed'
      }).setOrigin(.5));
      add(this.add.text(W / 2, 646, 'Катапульта: 1000 монет в магазине. Улучшения: по 100 монет!', {
        fontFamily: 'Arial', fontSize: 19, color: '#ffe7a0'
      }).setOrigin(.5));
      add(this.add.text(W / 2, 675, 'ВАЖНО: у героя только ОДНА ЖИЗНЬ. Смерть — поражение. Лечись в своей крепости!', {
        fontFamily: 'Arial', fontSize: 18, fontStyle: 'bold', color: '#ffaaaa'
      }).setOrigin(.5));
    }

    selectClass(id, layer) {
      if (!this.choosingClass) return;
      const warrior = id === 'warrior';
      const p = this.player;

      p.classId = id;
      p.maxHp = warrior ? 360 : 190;
      p.hp = p.maxHp;
      p.attackDamage = warrior ? 23 : 55;
      p.attackCd = warrior ? 380 : 1050;
      p.speed = warrior ? 220 : 235;
      p.attackRange = warrior ? 72 : 132;
      this.attackRadius.setRadius(p.attackRange + 45);
      this.attackRadius.setFillStyle(warrior ? 0x5bbdff : 0xc59bff, 0.065);
      this.attackRadius.setStrokeStyle(3, warrior ? 0x8cdaff : 0xdcbaff, .70);
      this.attackRadius.setVisible(this.rangeVisible);
      p.body.setTexture(warrior ? 'art-hero-warrior' : 'art-hero-mage').setDisplaySize(66,66);
      if(p.nameTag)p.nameTag.setText(warrior?'ВОИН':'МАГ');
      this.moveUnit(p, p.x, p.y);

      this.className = warrior ? 'ВОИН' : 'МАГ';
      this.choosingClass = false;
      this.refreshGameState();
      this.clockStartedAt = performance.now();
      layer.destroy();
      this.defaultStatus = this.className + ' готов к бою';
      this.status.setText(this.defaultStatus);
      this.spawnCreep();
    }

    toggleAttackRadius() {
      this.rangeVisible = !this.rangeVisible;
      this.attackRadius.setVisible(this.rangeVisible && !this.choosingClass && !this.gameOver);
      this.rangeButton.setText(this.rangeVisible ? '◉ ДАЛЬН.' : '◎ ДАЛЬН.');
    }

    getTextureForUnit(type, enemy, classId) {
      if (type === 'hero') return classId === 'mage' ? 'art-hero-mage' : 'art-hero-warrior';
      if (type === 'enemy') return 'art-hero-enemy';
      if (type === 'creep') return enemy ? 'art-creep-red' : 'art-creep-blue';
      if (type === 'catapult') return 'art-catapult';
      if (type === 'tower') return enemy ? 'art-tower-red' : 'art-tower-blue';
      if (type === 'crystal') return enemy ? 'art-fortress-red' : 'art-fortress-blue';
      return 'hero-warrior';
    }

    getRadiusForType(type) {
      if (type === 'crystal') return 31;
      if (type === 'creep') return 15;
      if (type === 'tower') return 34;
      if (type === 'catapult') return 27;
      return 22;
    }

    unit(x, y, type, enemy, hp, speed, classId = '') {
      const texture = this.getTextureForUnit(type, enemy, classId);
      const radius = this.getRadiusForType(type);
      const body = this.add.image(x, y, texture).setDepth(type === 'crystal' ? 4 : type === 'tower' ? 2 : 3);
      const artSizes = {hero:[66,66],enemy:[70,70],creep:[42,42],tower:[81,96],crystal:[135,118],catapult:[71,58]};
      body.setDisplaySize(...(artSizes[type] || [64,64]));

      const barWidth = type==='tower'||type==='crystal'?72:type==='creep'?36:55;
      const hpBg = this.add.rectangle(x, y - radius - 17, barWidth+4, 10, 0x071a1d).setStrokeStyle(1,0xced9d2,.65).setDepth(6);
      const hpFill = this.add.rectangle(x, y - radius - 17, barWidth, 6, enemy ? 0xf47771 : 0x6fe5a5).setDepth(7);
      const name = type==='hero'?'ВОИН':type==='enemy'?'ПРОТИВНИК':type==='catapult'?'КАТАПУЛЬТА':type==='tower'?'БАШНЯ':type==='crystal'?'КРЕПОСТЬ':'';
      const nameTag = name ? this.add.text(x,y-radius-37,name,{fontFamily:'Arial',fontSize:type==='tower'?12:13,color:enemy?'#ffbdb4':'#d9faff',fontStyle:'bold'}).setOrigin(.5).setDepth(7) : null;

      const u = {
        x, y, type, enemy, hp, maxHp: hp, speed, radius, body, hpBg, hpFill,
        attackRange: 48, attackDamage: 10, attackCd: 900, nextAttack: 0,
        dead: false, classId, barWidth, nameTag
      };
      this.entities.push(u);
      return u;
    }

    moveUnit(u, x, y) {
      u.x = clamp(x, 37, W - 37);
      u.y = clamp(y, 174, 510);
      u.body.setPosition(u.x, u.y);
      if (u === this.player && this.attackRadius) this.attackRadius.setPosition(u.x, u.y);
      u.hpBg.setPosition(u.x, u.y-u.radius-17);
      const ratio=Math.max(0,u.hp/u.maxHp);
      u.hpFill.setPosition(u.x-u.barWidth*(1-ratio)/2,u.y-u.radius-17);
      u.hpFill.width=u.barWidth*ratio;
      if(u.nameTag)u.nameTag.setPosition(u.x,u.y-u.radius-37);
    }

    makeButton(x, y, r, color, label) {
      this.add.circle(x, y, r, color, .85).setStrokeStyle(3, 0xf3ead8);
      this.add.text(x, y, label, { fontSize: 29, color: '#ffffff', fontStyle: 'bold' }).setOrigin(.5);
    }

    moveJoy(p) {
      const dx = p.x - this.joy.ox;
      const dy = p.y - this.joy.oy;
      const len = Math.hypot(dx, dy) || 1;
      const mag = Math.min(1, len / 52);
      this.joy.dx = dx / len * mag;
      this.joy.dy = dy / len * mag;
      this.joyThumb.setPosition(this.joy.ox + this.joy.dx * 48, this.joy.oy + this.joy.dy * 48);
    }

    spawnCreep() {
      if (this.gameOver || this.choosingClass) return;
      const a = this.unit(165, LANE_Y + Phaser.Math.Between(-23, 23), 'creep', false, 135, 65);
      a.attackDamage = 9;
      a.attackRange = 58;
      const b = this.unit(1085, LANE_Y + Phaser.Math.Between(-23, 23), 'creep', true, 135, 65);
      b.attackDamage = 9;
      b.attackRange = 58;
    }

    spawnCatapult() {
      // Purchase is initiated only from the shop.
      this.catapultsBought++;
      const c = this.unit(166, LANE_Y + 14, 'catapult', false, 380, 49);
      c.attackRange = 350;
      c.attackDamage = 11;
      c.buildingDamage = 165;
      c.attackCd = 1750;
      this.flash('Катапульта куплена за 1000 монет!', 0xffdc82);
    }

    // Catapults prefer towers and then the final crystal; other enemies are secondary.
    catapultTarget(u) {
      const buildings = this.entities.filter(t => this.alive(t) && t.enemy && t.type === 'tower');
      if (buildings.length) return buildings.sort((a,b) => dist(u,a)-dist(u,b))[0];
      if (this.alive(this.crystal)) return this.crystal;
      return this.nearest(u, this.entities, 500);
    }

    // Our fortress is a safe healing zone. Restores 28 HP per second.
    healAtBase(dt) {
      const p = this.player;
      if (dist(p, {x: 88, y: LANE_Y}) <= 130 && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 28 * dt);
        this.moveUnit(p, p.x, p.y);
      }
    }

    // Bot tactics: retreat below 35% HP, heal at its fortress, protect towers,
    // and push forward only with nearby friendly minions.
    moveToward(u, x, y, dt, stopDistance = 0) {
      const dx=x-u.x, dy=y-u.y, d=Math.hypot(dx,dy);
      if (d <= stopDistance || d < 1) return;
      const step=Math.min(u.speed * dt, d-stopDistance);
      this.moveUnit(u,u.x+dx/d*step,u.y+dy/d*step);
    }

    updateEnemyAI(dt) {
      const bot=this.enemy;
      if (!this.alive(bot)) return;
      const fortress={x:1194,y:LANE_Y};
      const inHeal=dist(bot,fortress)<=130;
      const healthRatio=bot.hp/bot.maxHp;
      if (healthRatio<=0.35) bot.retreating=true;
      if (bot.retreating && healthRatio>=0.92) bot.retreating=false;
      if (inHeal && bot.hp<bot.maxHp) {
        bot.hp=Math.min(bot.maxHp,bot.hp+28*dt);
        this.moveUnit(bot,bot.x,bot.y);
      }
      if (bot.retreating) {
        this.enemyMode='Лечится';
        this.moveToward(bot,fortress.x,fortress.y,dt,38);
        // Defend itself if chased all the way to the fortress.
        if (dist(bot,this.player)<=bot.attackRange+45) this.attack(bot);
        return;
      }

      const threatenedTower=this.towers
        .filter(t=>t.enemy&&this.alive(t))
        .map(t=>({
          tower:t,
          threat:this.entities.filter(v=>this.alive(v)&&!v.enemy&&
            (v.type==='hero'||v.type==='creep'||v.type==='catapult')&&dist(v,t)<270)
        }))
        .filter(x=>x.threat.length)
        .sort((a,b)=>dist(bot,a.tower)-dist(bot,b.tower))[0];
      if (threatenedTower) {
        this.enemyMode='Защищает башню';
        const closest=threatenedTower.threat.sort((a,b)=>dist(bot,a)-dist(bot,b))[0];
        if (dist(bot,closest)<=bot.attackRange+45) this.attack(bot);
        else this.moveToward(bot,closest.x,closest.y,dt,bot.attackRange+20);
        return;
      }

      const alliedCreeps=this.entities.filter(v=>this.alive(v)&&v.enemy&&v.type==='creep'&&
        dist(v,bot)<=300);
      if (alliedCreeps.length) {
        this.enemyMode='Наступает с крипами';
        const frontline=alliedCreeps.sort((a,b)=>a.x-b.x)[0];
        const nearby=this.nearest(bot,this.entities,bot.attackRange+45);
        if (nearby) this.attack(bot);
        else this.moveToward(bot,Math.max(250,frontline.x+35),frontline.y,dt,35);
        return;
      }
      this.enemyMode='Ждёт подкрепления';
      // Return to a defensive position near own towers, not into enemy territory.
      this.moveToward(bot,990,LANE_Y-30,dt,28);
      if (dist(bot,this.player)<=bot.attackRange+45) this.attack(bot);
    }

    buildMainMenu() {
      this.menuButton=this.add.text(770,14,'☰ МЕНЮ',{
        fontFamily:'Arial',fontSize:13,color:'#ffffff',backgroundColor:'#365167',
        padding:{x:8,y:6}
      }).setOrigin(1,0).setDepth(40).setInteractive({useHandCursor:true});
      this.menuButton.on('pointerdown',()=>this.toggleMainMenu());
      this.menuLayer=this.add.container(0,0).setDepth(112).setVisible(false);
      const put=o=>{this.menuLayer.add(o);return o;};
      put(this.add.rectangle(640,360,1280,720,0x071b20,.82).setInteractive());
      put(this.add.rectangle(640,340,520,370,0x17352f,.98).setStrokeStyle(3,0x9fcfd2));
      put(this.add.text(640,185,'ГЛАВНОЕ МЕНЮ',{
        fontFamily:'Arial',fontSize:38,fontStyle:'bold',color:'#f4eac6'
      }).setOrigin(.5));
      const makeBtn=(y,label,handler)=>{
        const bg=put(this.add.rectangle(640,y,310,62,0x2a7a6d).setStrokeStyle(2,0xa5ebd2).setInteractive({useHandCursor:true}));
        const txt=put(this.add.text(640,y,label,{fontFamily:'Arial',fontSize:24,fontStyle:'bold',color:'#ffffff'}).setOrigin(.5).setInteractive({useHandCursor:true}));
        bg.on('pointerdown',handler); txt.on('pointerdown',handler);
      };
      makeBtn(275,'ПРОДОЛЖИТЬ',()=>this.toggleMainMenu());
      makeBtn(355,'НОВЫЙ МАТЧ',()=>this.startNextMatch());
      makeBtn(435,'ВЫБОР КЛАССА',()=>this.startNextMatch());
      put(this.add.text(640,505,'M — открыть/закрыть меню',{
        fontFamily:'Arial',fontSize:17,color:'#b8cdc8'
      }).setOrigin(.5));
    }

    registerLifecycle() {
      this.onVisibility=()=>{this.hiddenPause=document.hidden;this.refreshGameState();};
      this.onBlur=()=>{this.hiddenPause=true;this.refreshGameState();};
      this.onFocus=()=>{this.hiddenPause=document.hidden;this.refreshGameState();};
      document.addEventListener('visibilitychange',this.onVisibility);
      window.addEventListener('blur',this.onBlur);
      window.addEventListener('focus',this.onFocus);
      this.removeSDKListener=window.MiniMobaSDK.onPlatformPause(paused=>{
        this.sdkPause=paused;
        this.refreshGameState();
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
        document.removeEventListener('visibilitychange',this.onVisibility);
        window.removeEventListener('blur',this.onBlur);
        window.removeEventListener('focus',this.onFocus);
        this.removeSDKListener?.();
        window.MiniMobaSDK.playing(false);
      });
    }

    refreshGameState() {
      const blocked=this.isPaused||this.shopOpen||this.menuOpen||this.hiddenPause||this.sdkPause||this.adTransition||this.gameOver||this.choosingClass;
      if(blocked)this.audio?.suspend();
      this.time.timeScale=blocked?0:1;
      this.tweens.timeScale=blocked?0:1;
      window.MiniMobaSDK.playing(!blocked);
      if(blocked && this.joy){
        this.joy.active=false;this.joy.dx=0;this.joy.dy=0;
        this.joyThumb?.setPosition(105,612);
      }
    }

    toggleMainMenu() {
      if (this.gameOver || this.choosingClass || this.shopOpen || this.isPaused || this.hiddenPause || this.sdkPause) return;
      this.menuOpen=!this.menuOpen;
      this.menuLayer.setVisible(this.menuOpen);
      this.refreshGameState();
      this.joy.active=false; this.joy.dx=0; this.joy.dy=0;
      this.joyThumb.setPosition(105,612);
    }

    async startNextMatch() {
      if(this.adTransition) return;
      this.adTransition=true;
      this.refreshGameState();
      // No ad during the first match; on subsequent match transitions only.
      // On a local file or without initialized SDK this returns immediately.
      try { await window.MiniMobaSDK.showInterstitial(); }
      catch(error) { console.warn('Ad transition failed:',error); }
      // The scene can be stopped by external navigation while an ad was open.
      if(this.sys.isActive()) this.scene.restart();
    }

    buildShop() {
      this.shopButton=this.add.text(990,14,'🛒 МАГАЗИН',{
        fontFamily:'Arial',fontSize:13,color:'#ffffff',backgroundColor:'#285a43',
        padding:{x:8,y:6}
      }).setOrigin(1,0).setDepth(40).setInteractive({useHandCursor:true});
      this.shopButton.on('pointerdown',()=>this.toggleShop());
      const layer=this.add.container(0,0).setDepth(115).setVisible(false);
      this.shopLayer=layer;
      const put=o=>{layer.add(o);return o;};
      put(this.add.rectangle(640,360,1280,720,0x051819,.82).setInteractive());
      put(this.add.rectangle(640,354,610,480,0x193a35,.98).setStrokeStyle(3,0x9ad7b2));
      put(this.add.text(640,172,'МАГАЗИН',{fontFamily:'Arial',fontSize:37,fontStyle:'bold',color:'#f5e5b9'}).setOrigin(.5));
      this.shopBalance=put(this.add.text(640,216,'',{fontFamily:'Arial',fontSize:22,color:'#ffe6a5'}).setOrigin(.5));
      const options=[
        ['Катапульта',1000,'catapult','Осадная машина'],
        ['+5 к атаке',100,'damage','Постоянное усиление'],
        ['+5 к HP',100,'health','+5 к максимуму и текущему HP']
      ];
      options.forEach(([name,price,id,description],i)=>{
        const y=280+i*85;
        const bg=put(this.add.rectangle(640,y,500,72,0x28574d).setStrokeStyle(2,0x71ad9a).setInteractive({useHandCursor:true}));
        put(this.add.text(410,y-10,name,{fontFamily:'Arial',fontSize:21,fontStyle:'bold',color:'#ffffff'}).setOrigin(0,.5));
        put(this.add.text(410,y+14,description,{fontFamily:'Arial',fontSize:14,color:'#c8dfd7'}).setOrigin(0,.5));
        put(this.add.text(860,y,price+' 💰',{fontFamily:'Arial',fontSize:21,color:'#ffda88'}).setOrigin(1,.5));
        bg.on('pointerdown',()=>this.buyItem(id,price));
      });
      const close=put(this.add.text(640,559,'ЗАКРЫТЬ  [B]',{
        fontFamily:'Arial',fontSize:21,fontStyle:'bold',color:'#ffffff',
        backgroundColor:'#437a64',padding:{x:22,y:10}
      }).setOrigin(.5).setInteractive({useHandCursor:true}));
      close.on('pointerdown',()=>this.toggleShop());
    }

    toggleShop() {
      if(this.gameOver||this.choosingClass||this.isPaused||this.menuOpen||this.hiddenPause||this.sdkPause)return;
      this.shopOpen=!this.shopOpen;
      this.shopLayer.setVisible(this.shopOpen);
      this.shopBalance.setText('Монеты: '+this.gold);
      this.refreshGameState();
      this.joy.active=false;this.joy.dx=0;this.joy.dy=0;
      this.joyThumb.setPosition(105,612);
    }

    buyItem(id,price) {
      if(!this.shopOpen||this.gold<price) {
        this.shopBalance.setText('Недостаточно монет: '+this.gold+' / '+price);
        return;
      }
      this.gold-=price;
      this.audio?.play('purchase');
      if(id==='catapult')this.spawnCatapult();
      else if(id==='damage')this.player.attackDamage+=5;
      else if(id==='health'){
        this.player.maxHp+=5;this.player.hp+=5;
        this.moveUnit(this.player,this.player.x,this.player.y);
      }
      this.shopBalance.setText('Монеты: '+this.gold+'   •   Куплено: '+(id==='catapult'?'катапульта':id==='damage'?'+5 атаки':'+5 HP'));
    }

    buildPauseMenu() {
      this.pauseButton=this.add.text(1100,14,'Ⅱ ПАУЗА',{
        fontFamily:'Arial',fontSize:13,color:'#ffffff',
        backgroundColor:'#183b4d',padding:{x:8,y:6}
      }).setOrigin(1,0).setDepth(40).setInteractive({useHandCursor:true});
      this.pauseButton.on('pointerdown',()=>this.togglePause());
      this.pauseLayer=this.add.container(0,0).setDepth(110).setVisible(false);
      const put=o=>{this.pauseLayer.add(o);return o;};
      put(this.add.rectangle(W/2,H/2,W,H,0x071b20,.88).setInteractive());
      put(this.add.text(640,238,'ПАУЗА',{
        fontFamily:'Arial',fontSize:60,fontStyle:'bold',color:'#f4eac6'
      }).setOrigin(.5));
      put(this.add.text(640,306,'Матч и таймер остановлены',{
        fontFamily:'Arial',fontSize:22,color:'#c8e4d8'
      }).setOrigin(.5));
      const btn=put(this.add.rectangle(640,407,280,70,0x287e70)
        .setStrokeStyle(3,0x8be6c5).setInteractive({useHandCursor:true}));
      const label=put(this.add.text(640,407,'ПРОДОЛЖИТЬ',{
        fontFamily:'Arial',fontSize:26,fontStyle:'bold',color:'#ffffff'
      }).setOrigin(.5).setInteractive({useHandCursor:true}));
      btn.on('pointerdown',()=>this.togglePause());
      label.on('pointerdown',()=>this.togglePause());
      put(this.add.text(640,482,'Esc / P — продолжить',{
        fontFamily:'Arial',fontSize:17,color:'#a2bdba'
      }).setOrigin(.5));
    }

    togglePause() {
      if (this.gameOver || this.choosingClass || this.shopOpen || this.menuOpen || this.hiddenPause || this.sdkPause) return;
      this.isPaused=!this.isPaused;
      this.pauseLayer.setVisible(this.isPaused);
      this.pauseButton.setText(this.isPaused?'▶ ИГРА':'Ⅱ ПАУЗА');
      this.refreshGameState();
      this.joy.active=false;
      this.joy.dx=0;this.joy.dy=0;
      this.joyThumb.setPosition(105,612);
    }

    alive(u) { return u && !u.dead && u.hp > 0; }

    nearest(from, candidates, maxDist = Infinity) {
      return candidates
        .filter(u => this.alive(u) && u.enemy !== from.enemy && u !== from && dist(from, u) < maxDist)
        .sort((a, b) => dist(from, a) - dist(from, b))[0];
    }

    towerTarget(tower) {
      if(this.alive(tower.aggroTarget) && this.time.now < (tower.aggroUntil||0) &&
         dist(tower,tower.aggroTarget)<=tower.attackRange) return tower.aggroTarget;
      const within=this.entities.filter(v=>this.alive(v)&&v.enemy!==tower.enemy&&dist(tower,v)<=tower.attackRange);
      // Creeps absorb tower attacks, unless a hero attacked an allied hero.
      return within.find(v=>v.type==='creep') ||
        within.find(v=>v.type==='catapult') ||
        within.find(v=>v.type==='hero'||v.type==='enemy') ||
        within.find(v=>v.type==='tower') || within.find(v=>v.type==='crystal');
    }

    attack(u) {
      if (this.isPaused || this.menuOpen || this.shopOpen || this.hiddenPause || this.sdkPause || this.gameOver || this.choosingClass || !this.alive(u) || this.time.now < u.nextAttack) return false;
      const locked = u===this.player && this.alive(this.lockedTarget) ? this.lockedTarget : null;
      const target = u===this.player && locked
        ? (dist(u,locked)<=u.attackRange+45 ? locked : null)
        : u.type === 'tower' ? this.towerTarget(u) : u.type === 'catapult'
        ? (this.alive(this.catapultTarget(u)) && dist(u, this.catapultTarget(u)) <= u.attackRange
            ? this.catapultTarget(u) : null)
        : this.nearest(u, this.entities, u.attackRange + (u.type === 'tower' ? 0 : 45));
      if (!target) {
        if (u === this.player) this.flash(locked?'Выбранная цель вне радиуса!':'Подойди ближе к врагу!', 0xffffff);
        return false;
      }

      u.nextAttack = this.time.now + u.attackCd;
      this.audio?.play(u===this.player?(u.classId==='mage'?'magic':'sword'):
        u===this.enemy?'enemy':u.type==='tower'?'tower':null);
      const damage = u.type === 'catapult' && ['tower','crystal'].includes(target.type) ? u.buildingDamage : u.attackDamage;
      if (u === this.player && u.classId === 'warrior') {
        this.swingSword(u,target,()=>this.hit(target,damage,u));
      } else if (u === this.player && u.classId === 'mage') {
        this.magicBolt(u,target,()=>this.hit(target,damage,u));
      } else if (u === this.enemy) {
        this.swingSword(u,target,()=>this.hit(target,damage,u), { outer: 0xff8a7b, inner: 0xffd4ce, burst: 0xff9c8f });
      } else {
        this.hit(target,damage,u);
        const color = u.enemy ? 0xffaaaa : 0xb9eaff;
        const line = this.add.line(0,0,u.x,u.y,target.x,target.y,color,.9).setOrigin(0).setDepth(10);
        this.tweens.add({targets:line,alpha:0,duration:160,onComplete:()=>line.destroy()});
      }
      return true;
    }

    swingSword(u,target,onImpact, colors = {}) {
      const angle = Math.atan2(target.y - u.y, target.x - u.x);
      const arc = this.add.graphics().setDepth(18);
      const streak = this.add.graphics().setDepth(17);
      const state = { progress: 0 };
      const radius = 28;
      const outer = colors.outer ?? 0xffd56d;
      const inner = colors.inner ?? 0xf8fbff;
      const burst = colors.burst ?? 0xffd875;
      const paint = () => {
        arc.clear();
        streak.clear();
        arc.lineStyle(8, outer, 0.42);
        arc.beginPath();
        arc.arc(u.x, u.y, radius + 3, angle - 0.95, angle - 0.95 + state.progress * 1.85, false);
        arc.strokePath();
        arc.lineStyle(4, inner, 0.96);
        arc.beginPath();
        arc.arc(u.x, u.y, radius, angle - 0.95, angle - 0.95 + state.progress * 1.85, false);
        arc.strokePath();
        const sx = u.x + Math.cos(angle) * 12;
        const sy = u.y + Math.sin(angle) * 12;
        const ex = u.x + Math.cos(angle) * (14 + state.progress * 18);
        const ey = u.y + Math.sin(angle) * (14 + state.progress * 18);
        streak.lineStyle(3, inner, 0.35).lineBetween(sx, sy, ex, ey);
      };
      let landed = false;
      this.tweens.add({
        targets: state, progress: 1, duration: 180, ease: 'Cubic.Out',
        onUpdate: () => {
          paint();
          if (!landed && state.progress >= .58) {
            landed = true;
            onImpact();
            this.impactBurst(target.x, target.y, burst);
          }
        },
        onComplete: () => { if (!landed) onImpact(); arc.destroy(); streak.destroy(); }
      });
    }

    magicBolt(u,target,onImpact) {
      const startX = u.x, startY = u.y;
      const trail = this.add.line(0, 0, startX, startY, startX, startY, 0xcda2ff, 0.32)
        .setOrigin(0).setLineWidth(2, 2).setDepth(16);
      const glow = this.add.circle(startX, startY, 12, 0xa470ff, .20).setDepth(17);
      const orb = this.add.circle(startX, startY, 6, 0xf3e9ff).setStrokeStyle(2, 0x9b59ff).setDepth(19);
      const state = { x: startX, y: startY };
      this.tweens.add({
        targets: state, x: target.x, y: target.y, duration: 250, ease: 'Sine.Out',
        onUpdate: () => {
          glow.setPosition(state.x, state.y);
          orb.setPosition(state.x, state.y);
          trail.geom.x2 = state.x;
          trail.geom.y2 = state.y;
        },
        onComplete: () => {
          glow.destroy(); orb.destroy(); trail.destroy();
          onImpact();
          this.impactBurst(target.x, target.y, 0xc48cff);
        }
      });
      this.tweens.add({ targets: trail, alpha: 0.0, duration: 280 });
    }

    impactBurst(x,y,color) {
      const ring = this.add.circle(x, y, 7, color, .18).setStrokeStyle(3, color, .92).setDepth(19);
      this.tweens.add({ targets: ring, scale: 2.0, alpha: 0, duration: 200, onComplete: () => ring.destroy() });
    }

    hit(target, damage, attacker) {
      if (!this.alive(target)) return;
      if (target.type === 'crystal' && this.towers.some(t => t.enemy && this.alive(t))) {
        if (attacker === this.player) this.flash('Сначала разрушь вражеские башни!', 0xffd38a);
        return;
      }
      if ((attacker.type==='hero'||attacker.type==='enemy') &&
          (target.type==='hero'||target.type==='enemy')) {
        this.towers.filter(t=>t.enemy===target.enemy&&this.alive(t)&&dist(t,attacker)<=t.attackRange)
          .forEach(t=>{t.aggroTarget=attacker;t.aggroUntil=this.time.now+3000;});
      }
      target.hp = Math.max(0, target.hp - damage);
      this.audio?.play('hit');
      this.impactBurst(target.x,target.y,target.enemy?0xff6c66:0xa5f7ff);
      const txt = this.add.text(target.x, target.y - 35, '-' + damage, {
        fontSize: 18, fontStyle: 'bold', color: '#fff3a1'
      }).setOrigin(.5).setDepth(20);
      this.tweens.add({ targets: txt, y: txt.y - 30, alpha: 0, duration: 550, onComplete: () => txt.destroy() });


      this.moveUnit(target, target.x, target.y);

      if (target.hp <= 0) {
        if (target.type==='tower'||target.type==='crystal')this.audio?.play('destroy');
        else if (target.type==='creep')this.audio?.play('creepDeath');
        target.dead = true;
        target.body.setVisible(false);
        target.hpBg.setVisible(false);
        target.hpFill.setVisible(false);
        if(target.nameTag)target.nameTag.setVisible(false);

        if (target.type === 'crystal') {
          this.end(true);
        } else if (target === this.player) {
          this.end(false);
        } else if (!target.enemy && target.type === 'creep') {
          // no extra reward
        } else if (target.enemy) {
          // Coins are credited to the player's team when an enemy dies.
          const reward = target.type === 'creep' ? 5 : target.type === 'tower' ? 50 : target.type === 'enemy' ? 100 : 0;
          this.gold += reward;
          this.goldEarned += reward;
          if (target.type === 'creep') this.creepKills++;
          if (target.type === 'enemy') this.heroKills++;
          if (target.type === 'tower') this.towersDestroyed++;
          if (target.type === 'creep' || target.type === 'enemy') this.kills++;

          if (target === this.enemy) {
            this.time.delayedCall(5500, () => {
              if (!this.gameOver) {
                target.hp = target.maxHp;
                target.dead = false;
                target.body.setVisible(true);
                target.hpBg.setVisible(true);
                target.hpFill.setVisible(true);
                if(target.nameTag)target.nameTag.setVisible(true);
                this.moveUnit(target, 960, LANE_Y - 36);
              }
            });
          }
        }
      }
    }

    flash(t, color) {
      this.status.setText(t).setColor('#' + color.toString(16).padStart(6, '0'));
      this.time.delayedCall(950, () => {
        if (!this.gameOver) this.status.setText(this.defaultStatus).setColor('#ffffff');
      });
    }

    addLeaderboardButton() {
      const btn = this.add.text(879, 14, '🏆 ЛИДЕРЫ', {
        fontFamily: 'Arial', fontSize: 13, fontStyle: 'bold', color: '#ffefb1',
        backgroundColor: '#173e3a', padding: { x: 8, y: 6 }
      }).setOrigin(1, 0).setDepth(30).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.showLeaderboard());
    }

    async showLeaderboard() {
      if (this.leaderOverlay) return;
      // HTML overlay stays readable on narrow screens and is safe for SDK user names.
      const overlay = document.createElement('div');
      overlay.className = 'leaderboard-overlay';
      overlay.innerHTML = '<div class="leaderboard-panel"><h2>🏆 Лучшее время победы</h2>' +
        '<p class="leaderboard-best"></p><p class="leaderboard-state">Загружаем рейтинг…</p>' +
        '<div class="leaderboard-rows"></div><button type="button">ЗАКРЫТЬ</button></div>';
      document.body.appendChild(overlay);
      this.leaderOverlay = overlay;
      const close = () => { overlay.remove(); if (this.leaderOverlay === overlay) this.leaderOverlay = null; };
      overlay.querySelector('button').onclick = close;
      overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
      const best = this.leaderboard.localBest();
      overlay.querySelector('.leaderboard-best').textContent =
        'Твой лучший результат: ' + (best ? this.leaderboard.format(best) : 'пока нет побед');
      const data = await this.leaderboard.getLeaders();
      if (!overlay.isConnected) return;
      const state = overlay.querySelector('.leaderboard-state');
      const rows = overlay.querySelector('.leaderboard-rows');
      if (data.offline) {
        state.textContent = 'Онлайн-рейтинг появится после публикации и настройки лидерборда Яндекса.';
        return;
      }
      state.textContent = data.entries.length ? 'Топ игроков по скорости победы:' : 'Пока никто не установил рекорд.';
      data.entries.forEach(entry => {
        const line = document.createElement('div');
        line.className = 'leaderboard-row';
        const name = document.createElement('span');
        name.textContent = '#' + (entry.rank || '?') + '  ' + (entry.player?.publicName || 'Игрок');
        const time = document.createElement('strong');
        time.textContent = this.leaderboard.format(Number(entry.score));
        line.append(name, time);
        rows.append(line);
      });
    }

    end(won) {
      this.audio?.play(won?'victory':'defeat');
      this.gameOver = true;
      this.refreshGameState();
      if (won && this.leaderboard) {
        const ms = this.elapsed * 1000;
        this.leaderboard.submitWin(ms, this.className);
      }
      this.attackRadius.setVisible(false);
      this.status.setText(won ? 'ПОБЕДА! Вражеская база уничтожена!' : 'ПОРАЖЕНИЕ! Герой погиб!')
        .setColor(won ? '#8bff9e' : '#ff9a9a');

      const ui = this.add.container(0, 0).setDepth(60);
      const add = obj => { ui.add(obj); return obj; };
      add(this.add.rectangle(640, 360, 1280, 720, 0x06161b, 0.83));
      add(this.add.rectangle(640, 350, 650, 570, 0x17352f, 0.98)
        .setStrokeStyle(3, won ? 0x7ee7a5 : 0xf18b8b));
      add(this.add.text(640, 139, won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ', {
        fontFamily: 'Arial', fontSize: 56, fontStyle: 'bold',
        color: won ? '#a5f6bc' : '#ffb6b6'
      }).setOrigin(.5));
      add(this.add.text(640, 192, 'ИТОГИ МАТЧА · ' + this.className, {
        fontFamily: 'Arial', fontSize: 21, color: '#dcece6'
      }).setOrigin(.5));

      const duration = Math.floor(this.elapsed / 60) + ':' +
        String(Math.floor(this.elapsed % 60)).padStart(2, '0');
      const rows = [
        ['Продолжительность', duration],
        ['Убито крипов', String(this.creepKills)],
        ['Убито героев', String(this.heroKills)],
        ['Разрушено башен', String(this.towersDestroyed) + ' / 2'],
        ['Всего заработано монет', String(this.goldEarned)],
        ['Монет осталось', String(this.gold)],
        ['Куплено катапульт', String(this.catapultsBought)]
      ];
      rows.forEach(([label, value], i) => {
        const y = 245 + i * 45;
        add(this.add.text(362, y, label, {
          fontFamily: 'Arial', fontSize: 21, color: '#c7ddd5'
        }).setOrigin(0, .5));
        add(this.add.text(918, y, value, {
          fontFamily: 'Arial', fontSize: 23, fontStyle: 'bold', color: '#f3dda0'
        }).setOrigin(1, .5));
      });

      const button = add(this.add.rectangle(640, 608, 300, 64, 0x2e8a69)
        .setStrokeStyle(2, 0x9eeac5).setInteractive({ useHandCursor: true }));
      const label = add(this.add.text(640, 608, 'ИГРАТЬ СНОВА', {
        fontFamily: 'Arial', fontSize: 25, fontStyle: 'bold', color: '#ffffff'
      }).setOrigin(.5).setInteractive({ useHandCursor: true }));
      button.on('pointerdown', () => this.startNextMatch());
      label.on('pointerdown', () => this.startNextMatch());
      const leaderLink = add(this.add.text(640, 686, '🏆 ПОСМОТРЕТЬ ТАБЛИЦУ ЛИДЕРОВ', {
        fontFamily: 'Arial', fontSize: 17, color: '#ffe49b'
      }).setOrigin(.5).setInteractive({ useHandCursor: true }));
      leaderLink.on('pointerdown', () => this.showLeaderboard());
      add(this.add.text(640, 665, 'На компьютере также можно нажать R', {
        fontFamily: 'Arial', fontSize: 16, color: '#a6c1b8'
      }).setOrigin(.5));
    }

    update(time, delta) {
      if (this.isPaused || this.shopOpen || this.menuOpen || this.hiddenPause || this.sdkPause || this.gameOver || this.choosingClass) return;

      const dt = Math.min(delta / 1000, .04);
      const k = this.keys;
      const p = this.player;

      const vx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0) + this.joy.dx;
      const vy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0) + this.joy.dy;
      const v = Math.hypot(vx, vy);
      if (v > .05) this.moveUnit(p, p.x + vx / v * p.speed * dt, p.y + vy / v * p.speed * dt);

      if (k.SPACE.isDown) this.attack(p);
      if (this.lockedTarget && !this.alive(this.lockedTarget)) this.lockedTarget=null;
      const highlighted=this.lockedTarget || this.nearest(p,this.entities,p.attackRange+45);
      this.targetMarker.setVisible(!!highlighted);
      this.lockLabel.setVisible(!!this.lockedTarget);
      if(highlighted){
        this.targetMarker.setPosition(highlighted.x,highlighted.y).setRadius(highlighted.radius+12);
        this.targetMarker.setStrokeStyle(this.lockedTarget?4:2,this.lockedTarget?0xffd14a:0xffec8c,this.lockedTarget?1:.55);
        if(this.lockedTarget)this.lockLabel.setPosition(highlighted.x,highlighted.y-highlighted.radius-54);
      }
      this.healAtBase(dt);

      for (const u of this.entities) {
        if (!this.alive(u) || u === p || u.type === 'crystal') continue;
        if (u.type === 'tower') { this.attack(u); continue; }
        if (u === this.enemy) { this.updateEnemyAI(dt); continue; }
        if (u.type === 'catapult') {
          const target = this.catapultTarget(u);
          if (target) {
            if (dist(u,target) <= u.attackRange) this.attack(u);
            else {
              const dx=target.x-u.x, dy=target.y-u.y, d=Math.hypot(dx,dy)||1;
              this.moveUnit(u, u.x+dx/d*u.speed*dt, u.y+dy/d*u.speed*dt);
            }
          }
          continue;
        }
        const target = this.nearest(u, this.entities, u.type === 'enemy' ? 260 : 125);
        if (target) {
          if (dist(u, target) <= u.attackRange + target.radius) {
            this.attack(u);
          } else if (u.speed) {
            const dx = target.x - u.x;
            const dy = target.y - u.y;
            const d = Math.hypot(dx, dy) || 1;
            this.moveUnit(u, u.x + dx / d * u.speed * dt, u.y + dy / d * u.speed * dt);
          }
        } else if (u.type === 'creep') {
          this.moveUnit(u, u.x + (u.enemy ? -1 : 1) * u.speed * dt, u.y);
        } else if (u === this.enemy && dist(u, { x: 940, y: LANE_Y }) > 80) {
          this.moveUnit(u, u.x + (940 - u.x) * dt * .3, u.y + (LANE_Y - u.y) * dt * .3);
        }
      }

      this.elapsed += dt;
      this.info.setText(
        'Монеты: ' + this.gold +
        '   •   Время: ' + Math.floor(this.elapsed / 60) + ':' + String(Math.floor(this.elapsed % 60)).padStart(2, '0') +
        '   •   Башни врага: ' + this.towers.filter(t => t.enemy && this.alive(t)).length
      );

      this.hpLabel.setText(
        this.className + '  •  HP ' + Math.floor(p.hp) + ' / ' + p.maxHp +
        '  •  Дальность: ' + (p.attackRange + 45) +
        '  •  Катапульты: ' + this.catapultsBought +
        '  •  Бот: ' + this.enemyMode
      );
    }
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: '#173c2d',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true },
    scene: [Battle],
    input: { activePointers: 3 }
  });
})();
