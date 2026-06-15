/* ============================================================
   GRAND LINE LEGENDS — Pixel Sprites
   Each character: 16x16 grid. '.' = transparent, letters map
   to that character's palette. Hand-drawn, one per fighter.
   ============================================================ */

const SPRITES = {

  luffy: {
    pal: { Y: '#e8c95a', R: '#c8281e', s: '#f2c79b', h: '#2a1a12', e: '#1a1a1a', b: '#3a5fa8', n: '#8a5a2a' },
    rows: [
      '................',
      '....YYYYYYY.....',
      '...YYYYYYYYY....',
      '...YYYYYYYYY....',
      '...RRRRRRRRR....',
      '.YYYYYYYYYYYYY..',
      '...hhssssshh....',
      '...sessssess....',
      '....ssssss......',
      '...RRRRRRRR.....',
      '..sRRRRRRRRs....',
      '..sRRRRRRRRs....',
      '...bbbbbbbb.....',
      '...bbb..bbb.....',
      '...sss..sss.....',
      '...nn....nn.....',
    ],
  },

  zoro: {
    pal: { g: '#4a9a5a', G: '#1f6a45', s: '#e8b88a', e: '#1a1a1a', k: '#23232b', r: '#b03030', w: '#cfd8e0', t: '#6a4a2a' },
    rows: [
      '................',
      '....ggggggg.....',
      '...ggggggggg....',
      '...ggggggggg....',
      '...ggggggggg.w..',
      '...gssssssg..w..',
      '...sksssses..w..',
      '....ssssss...w..',
      '...GGGGGGGG..w..',
      '..sGGGGGGGGs.w..',
      '..sGGrrrrGGs.t..',
      '...GGGGGGGG..t..',
      '...kkkkkkkk.....',
      '...kkk..kkk.....',
      '...kkk..kkk.....',
      '...tt....tt.....',
    ],
  },

  nami: {
    pal: { o: '#e8833a', s: '#f5d0a8', e: '#1a1a1a', w: '#f5f5f5', b: '#3a6ab4', B: '#7fc4e8', n: '#8a5a2a' },
    rows: [
      '................',
      '....ooooooo.....',
      '...ooooooooo....',
      '..ooooooooooo...',
      '..oossssssoo....',
      '..oosesssseoo...',
      '..oossssssoo....',
      '..oo.ssss.oo....',
      '..oo.wwww.oo..B.',
      '....swwwws....B.',
      '....swwwws....B.',
      '....sssss.....B.',
      '....bbbbbb....B.',
      '....bb..bb......',
      '....bb..bb......',
      '....nn..nn......',
    ],
  },

  usopp: {
    pal: { y: '#d4b03a', g: '#b8c4cc', G: '#5aa8d4', s: '#c8956a', n: '#b8835a', e: '#1a1a1a', o: '#7a8a3a', w: '#f0f0f0', r: '#6a4a2a' },
    rows: [
      '................',
      '....yyyyyyy.....',
      '...yyyyyyyyy....',
      '...gGgyyyyyy....',
      '...ssssssssy....',
      '...sessssesy....',
      'nnnsssssssy.....',
      '....ssssss......',
      '...oowwwwoo.....',
      '..soooooooos....',
      '..soooooooos....',
      '...oooooooo.....',
      '...oooooooo.....',
      '...ooo..ooo.....',
      '...rrr..rrr.....',
      '...rr....rr.....',
    ],
  },

  sanji: {
    pal: { y: '#e8c95a', s: '#f2c79b', e: '#1a1a1a', k: '#26262e', t: '#2a3a6a', c: '#f0f0f0', f: '#e87a2a' },
    rows: [
      '................',
      '....yyyyyyy.....',
      '...yyyyyyyyy....',
      '...yyyyyyyyy....',
      '...yyyyyyyyy....',
      '...ssssssyyy....',
      '...sessssyyy....',
      '..fcssssyyyy....',
      '....ssssss......',
      '...kkkkttkk.....',
      '..skkkkttkks....',
      '..skkkkkkkks....',
      '...kkkkkkkk.....',
      '...kkk..kkk.....',
      '...kkk..kkk.....',
      '...kk....kk.....',
    ],
  },

  chopper: {
    pal: { p: '#e87aa4', w: '#f5f5f5', a: '#8a5a2a', f: '#a4703a', s: '#d4a878', e: '#1a1a1a', b: '#4a8ad4', r: '#8a3a4a' },
    rows: [
      '................',
      '.....pppppp.....',
      '..a.pppwwppp.a..',
      '.aaappppppppaaa.',
      '..a.pppppppp.a..',
      '....ffffffff....',
      '....fessssef....',
      '....sssbbsss....',
      '....ffffffff....',
      '.....ffffff.....',
      '....ffffffff....',
      '....rrrrrrrr....',
      '.....rrrrrr.....',
      '.....ff..ff.....',
      '.....ff..ff.....',
      '................',
    ],
  },

  robin: {
    pal: { h: '#1f1a2e', s: '#d9a878', e: '#1a1a1a', p: '#6a3a8a', k: '#2e2438', f: '#e87aa4' },
    rows: [
      '................',
      '....hhhhhhh.....',
      '...hhhhhhhhh....',
      '..hhhhhhhhhhh...',
      '..hhsssssshh....',
      '..hhsesseshh....',
      '..hhsssssshh....',
      '...h.ssss.h.....',
      '...h.pppp.h.....',
      '...hsppppsh.....',
      '...hsppppsh.f...',
      '....pppppp......',
      '....kkkkkk......',
      '....kkkkkk......',
      '....kk..kk......',
      '....hh..hh......',
    ],
  },

  franky: {
    pal: { b: '#2a7ad4', k: '#1a1a1a', s: '#e8a878', r: '#d43a3a', m: '#9aa8b4' },
    rows: [
      '.....bbb........',
      '...bbbbbbb......',
      '..bbbbbbbbbb....',
      '..bbbbbbbbbb....',
      '...kkkkkkkk.....',
      '...ssssssss.....',
      '...ssmmssss.....',
      '....ssssss......',
      '...rrrrrrrr.....',
      '.mmsrrrrrrsmm...',
      '.mmsrrrrrrsmm...',
      '.mm.rrrrrr.mm...',
      '....kkkkkk......',
      '....ss..ss......',
      '....ss..ss......',
      '....mm..mm......',
    ],
  },

  brook: {
    pal: { a: '#1a1a22', w: '#f0ead8', e: '#0a0a0a', k: '#26262e', o: '#e8833a' },
    rows: [
      '...aaaaaaaaa....',
      '..aaaaaaaaaaa...',
      '..aaaaaaaaaaa...',
      '..aaaaaaaaaaa...',
      '...wwwwwwww.....',
      '...wewwwwew.....',
      '...wwwwwwww.....',
      '....wwwwww......',
      '....ooooo.......',
      '..wkkkkkkkkw....',
      '...kkkkkkkk..w..',
      '...kkkkkkkk..w..',
      '...kkkkkkkk..w..',
      '....kk..kk...w..',
      '....kk..kk...w..',
      '....kk..kk......',
    ],
  },

  jinbe: {
    pal: { B: '#5a9ad4', h: '#1a1a22', y: '#e8b83a', k: '#2a2a2a', w: '#f0f0f0', e: '#0a0a0a', n: '#8a5a2a' },
    rows: [
      '................',
      '......hh........',
      '.....hhhh.......',
      '...BBBBBBBB.....',
      '..BBBBBBBBBB....',
      '..BeBBBBBBeB....',
      '..BBBBBBBBBB....',
      '..BwBBBBBBwB....',
      '...BBBBBBBB.....',
      '..yyyyyyyyyy....',
      '.Byyykkkyyy.B...',
      '.Byyyyyyyyy.B...',
      '..yyyyyyyyyy....',
      '...yyy..yyy.....',
      '...BB....BB.....',
      '...nn....nn.....',
    ],
  },

  garp: {
    pal: { w: '#e8e8e8', s: '#e8b88a', e: '#1a1a1a', m: '#f5f5f5', g: '#e8b83a', d: '#33333d', k: '#1a1a1a' },
    rows: [
      '................',
      '....wwwwwww.....',
      '...wwwwwwwww....',
      '...wwwwwwwww....',
      '...ssssssss.....',
      '...sessssess....',
      '...ssssssss.....',
      '...wwssssww.....',
      '....ssssss......',
      '...mmmmmmmm.....',
      '..smggggggms....',
      '..smmmmmmmms....',
      '...dddddddd.....',
      '...ddd..ddd.....',
      '...ddd..ddd.....',
      '...kk....kk.....',
    ],
  },

  akainu: {
    pal: { h: '#1a1a22', s: '#d9a070', e: '#1a1a1a', r: '#b8302a', m: '#f0f0f0', o: '#e86a2a', y: '#f5c43a', k: '#222222' },
    rows: [
      '................',
      '....hhhhhhh.....',
      '...hhhhhhhhh....',
      '...hhhhhhhhh....',
      '...ssssssss.....',
      '...sessssess....',
      '...ssssssss.....',
      '....ssssss......',
      '..mrrrrrrrrm....',
      '.mmrrrrrrrrmm...',
      '.m.rrrrrrrr.m...',
      'oo.rrrrrrrr.....',
      'yo.rrrrrrrr.....',
      '...rrr..rrr.....',
      '...rrr..rrr.....',
      '...kk....kk.....',
    ],
  },

  aokiji: {
    pal: { h: '#1a1a22', s: '#d9a878', e: '#1a1a1a', w: '#f0f0f0', b: '#4a5a7a', i: '#aee4f5', I: '#5ab8d4', k: '#222222' },
    rows: [
      '................',
      '....hhhhhhh.....',
      '...hhhhhhhhh....',
      '...hhhhhhhhh....',
      '...ssssssss.....',
      '...sessssess....',
      '...ssssssss.....',
      '....ssssss......',
      '...wwwwwwww.....',
      '..swwwwwwwws....',
      '..iwwwwwwwwi....',
      '.iI.wwwwww.Ii...',
      '...bbbbbbbb.....',
      '...bbb..bbb.....',
      '...bbb..bbb.....',
      '...kk....kk.....',
    ],
  },

  kizaru: {
    pal: { h: '#2a2218', s: '#e8b88a', e: '#1a1a1a', y: '#e8c43a', d: '#c9a32e', m: '#f0f0f0', l: '#fff7b0', k: '#2a2a2a' },
    rows: [
      '................',
      '.....hhhhh......',
      '....hhhhhhh.....',
      '...ssssssss.....',
      '...sessssess....',
      '...ssssssss.....',
      '...ssssssss.....',
      '....ssssss......',
      '.mmyyyyyyyymm...',
      '.m.ydydydyy.m...',
      '.l.yyyyyyyy.l...',
      '...yyyyyyyy.....',
      '...dddddddd.....',
      '...ddd..ddd.....',
      '...ddd..ddd.....',
      '...kk....kk.....',
    ],
  },

  magellan: {
    pal: { r: '#8a2a2a', k: '#26262e', s: '#c46a5a', e: '#0a0a0a', w: '#f0f0f0', p: '#9a4ad4', P: '#c47ae8' },
    rows: [
      '..r..........r..',
      '..rr.kkkkk.rr...',
      '...rkkkkkkkr....',
      '....kkkkkkk.....',
      '...ssssssss.....',
      '...sessssess....',
      '...ssssssss.....',
      '....ssspps......',
      '...kkkkkkkk.....',
      '..skkkwwkkks....',
      '..pkkkwwkkkp....',
      '.pP.kkkkkk.Pp...',
      '...kkkkkkkk.....',
      '...kkk..kkk.....',
      '...kkk..kkk.....',
      '...pp....pp.....',
    ],
  },

  mihawk: {
    pal: { g: '#2a4a3a', w: '#f0f0f0', s: '#e8c4a0', y: '#e8c43a', h: '#1a1a22', k: '#26262e', r: '#8a2a3a', b: '#3a3a4a', c: '#c9a32e' },
    rows: [
      '.......w........',
      '......ww........',
      '..gggggggggg..b.',
      '...ggggggg....b.',
      '...sssssss....b.',
      '...sysssys....b.',
      '...shhhhhs....b.',
      '....shhs......b.',
      '...kkkkkkk....b.',
      '..skkrrkkks..ccc',
      '..skkkkkkks...b.',
      '...kkkkkkk......',
      '...kkkkkkk......',
      '...kkk..kkk.....',
      '...kkk..kkk.....',
      '...hh....hh.....',
    ],
  },

  crocodile: {
    pal: { h: '#1a1a22', s: '#d9a878', e: '#1a1a1a', c: '#a06a4a', f: '#6a7a6a', F: '#8a9a8a', v: '#33333d', g: '#e8b83a', t: '#6a4a2a', m: '#cccccc' },
    rows: [
      '................',
      '....hhhhhhh.....',
      '...hhhhhhhhh....',
      '...hhhhhhhhh....',
      '...ssssssss.....',
      '...sessssess....',
      '...scscscscs....',
      '..mtssssss......',
      '..FFFFFFFFFF....',
      '.FfvvvvvvvvfF...',
      '.Ff.vvvvvv.fF...',
      '.g..vvvvvv..F...',
      '...vvvvvvvv.....',
      '...vvv..vvv.....',
      '...vvv..vvv.....',
      '...hh....hh.....',
    ],
  },

  doflamingo: {
    pal: { y: '#e8d43a', w: '#f5f5f5', p: '#8a4ad4', s: '#e8b888', f: '#e87aa4', F: '#f5a4c4', o: '#e8833a' },
    rows: [
      '................',
      '....yyyyyyy.....',
      '...yyyyyyyyy....',
      '...wwwwwwwww....',
      '...wppwwppw.....',
      '...ssssssss.....',
      '...swwwwwws.....',
      '....ssssss......',
      '.fFffffffffFf...',
      'fFf.wwwwww.fFf..',
      'fFf.wwwwww.fFf..',
      '.ff.wwwwww.ff...',
      '...oooooooo.....',
      '...ooo..ooo.....',
      '...ooo..ooo.....',
      '...ww....ww.....',
    ],
  },

  hancock: {
    pal: { h: '#1a1a2e', s: '#f5d4b0', e: '#1a1a1a', r: '#c43a5a', g: '#e8c43a', w: '#f0f0f0' },
    rows: [
      '...hhhhhhhhh....',
      '..hhhhhhhhhhh...',
      '..hhhhhhhhhhh...',
      '..hhsssssshh....',
      '..hhsesseshh....',
      '..hhsssssshh....',
      '.ghhsssssshhg...',
      '..hh.ssss.hh....',
      '..hh.rrrr.hh....',
      '..hhsrrrrshh....',
      '..hh.rrrr.hh....',
      '...h.rrrr.h.....',
      '....rrrrrr......',
      '....rrrrrr......',
      '....rrrrrr......',
      '....ww..ww......',
    ],
  },

  law: {
    pal: { w: '#f0f0f0', k: '#26262e', s: '#d9a878', e: '#1a1a1a', h: '#1a1a22', y: '#e8c43a', b: '#9aa8b8', j: '#3a4a6a' },
    rows: [
      '................',
      '....wwwwwww..b..',
      '...wkwwkwwkw.b..',
      '...wwwwwwwww.b..',
      '...hssssssh..b..',
      '...hesssseh..b..',
      '...ssssssss..b..',
      '....ssssss...b..',
      '...yyyyyyyy..w..',
      '..kyyykkyyyk.w..',
      '..kyyyyyyyyk.w..',
      '...yyyyyyyy.....',
      '...jjjjjjjj.....',
      '...jjj..jjj.....',
      '...jjj..jjj.....',
      '...kk....kk.....',
    ],
  },

  shanks: {
    pal: { r: '#c8302a', s: '#e8b88a', e: '#1a1a1a', c: '#8a4a3a', w: '#f0f0f0', k: '#2e2e3a', n: '#6a4a2a' },
    rows: [
      '................',
      '....rrrrrrr.....',
      '...rrrrrrrrr....',
      '...rrrrrrrrr....',
      '...ssssssss.....',
      '...scsssses.....',
      '...scssssss.....',
      '....ssssss......',
      '...wwwwwwkk.....',
      '..swwwwwwkkk....',
      '..swwwwwwkkk....',
      '...wwwwwwkk.....',
      '...nnnnnnnn.....',
      '...nnn..nnn.....',
      '...nnn..nnn.....',
      '...kk....kk.....',
    ],
  },

  whitebeard: {
    pal: { w: '#f0ead8', s: '#e8b888', e: '#1a1a1a', k: '#1a1a22', c: '#f5f5f5', g: '#e8b83a', t: '#d9a070', b: '#6a4a2a', B: '#c4d0dc' },
    rows: [
      '..............B.',
      '....kkkkkkk...B.',
      '...kkkkkkkkk..b.',
      '...wsssssssw..b.',
      '...sessssess..b.',
      '..wwsssssssww.b.',
      '.ww.ssssss.ww.b.',
      '.ww..ssss..ww.b.',
      '....tttttt....b.',
      '..cttttttttc..b.',
      '..cttttttttc..b.',
      '..c.tttttt.c..b.',
      '...kkkkkkkk.....',
      '...kkk..kkk.....',
      '...kkk..kkk.....',
      '...gg....gg.....',
    ],
  },

  blackbeard: {
    pal: { k: '#1a1a22', s: '#c89070', e: '#1a1a1a', b: '#2a2218', w: '#f0f0f0', d: '#33333d', R: '#a43a3a' },
    rows: [
      '................',
      '....kkkkkkk.....',
      '...kkkkkkkkk....',
      '...ssssssss.....',
      '...sessssess....',
      '...ssssssss.....',
      '..bbsswwssbb....',
      '..bbbwswsbbb....',
      '..bbbbbbbbbb....',
      '.sdddddddddds...',
      '.sdddRRRRddds...',
      '..dddddddddd....',
      '...dddddddd.....',
      '...ddd..ddd.....',
      '...ddd..ddd.....',
      '...kk....kk.....',
    ],
  },

  kaido: {
    pal: { o: '#d9b888', h: '#1a1a22', s: '#d9a070', E: '#c43a3a', t: '#d9a070', r: '#e8d4a0', k: '#3a3a44', S: '#9aa8b8' },
    rows: [
      '.o...........o..',
      '.oo.hhhhhhh.oo..',
      '..oohhhhhhhoo...',
      '...hhhhhhhhh....',
      '...ssssssss..k..',
      '...sEssssEs..k..',
      '...shsssshs..S..',
      '...h.ssss.h..k..',
      '...htttttth..k..',
      '..stttttttts.k..',
      '..stttttttts.k..',
      '...rrrrrrrr..k..',
      '...tttttttt..S..',
      '...ttt..ttt..k..',
      '...ttt..ttt.....',
      '...kk....kk.....',
    ],
  },

  bigmom: {
    pal: { p: '#e88ab4', P: '#f5b4d0', s: '#f5d0b0', e: '#1a1a1a', r: '#c43a3a', d: '#c45a7a', w: '#f5f5f5' },
    rows: [
      '....pppppp......',
      '..pppppppppp....',
      '.pppPPppPPppp...',
      '.pppppppppppp...',
      '.ppsssssssspp...',
      '.ppsesssespp....',
      '.ppsssssssspp...',
      '..pp.ssrrss.pp..',
      '..ddddddddddd...',
      '.sdddwddwdddds..',
      '.sddddddddddds..',
      '..ddwddddwdd....',
      '..ddddddddddd...',
      '...ddddddddd....',
      '...ddddddddd....',
      '....ww...ww.....',
    ],
  },

  ace: {
    pal: { o: '#e8833a', r: '#c43a3a', h: '#1a1a22', s: '#e8b070', e: '#1a1a1a', f: '#b8835a', t: '#e8b070', k: '#26262e', F: '#e8542f', Y: '#f5c43a', n: '#6a4a2a' },
    rows: [
      '................',
      '....ooooooo.....',
      '...ooooooooo....',
      '...oroorooro....',
      '...hhhhhhhh.....',
      '...sessssess....',
      '...sfssssfs.....',
      '....ssssss......',
      '..FttttttttF....',
      '.YFttttttttFY...',
      '..stttttttts....',
      '...tttttttt.....',
      '...kkkkkkkk.....',
      '...kkk..kkk.....',
      '...kkk..kkk.....',
      '...nn....nn.....',
    ],
  },

  marco: {
    pal: { y: '#e8d43a', s: '#e8b88a', e: '#1a1a1a', p: '#6a4a8a', t: '#d9a878', B: '#5ac4e8', b: '#3a6ab4', k: '#2e2e3a', w: '#d9c8a8' },
    rows: [
      '................',
      '......yyy.......',
      '.....yyyyy......',
      '...ssssssss.....',
      '...sessssess....',
      '...ssssssss.....',
      '....ssssss......',
      '.B..pppppp..B...',
      'BBspttttpsBB....',
      '.BspttttttpsB...',
      '..spttttttps....',
      '...bbbbbbbb.....',
      '...kkkkkkkk.....',
      '...kkk..kkk.....',
      '...kkk..kkk.....',
      '...ww....ww.....',
    ],
  },

  enel: {
    pal: { y: '#e8d48a', s: '#e8c498', e: '#1a1a1a', b: '#4a7ad4', g: '#e8c43a', L: '#f5e43a', w: '#f0f0f0' },
    rows: [
      '................',
      '....yyyyyy......',
      '...yyyyyyyy.....',
      '...ssssssss.....',
      '...sessssess....',
      '..s.ssssss.s....',
      '..s.ssssss.s....',
      '..s..ssss..s....',
      '..g..ssss..g....',
      '.Lssssssssss.L..',
      '...bbbbbbbb.....',
      '...wwwwwwww.....',
      '..wwwwwwwwww....',
      '..www....www....',
      '...ww....ww.....',
      '...ss....ss.....',
    ],
  },

  buggy: {
    pal: { w: '#f0f0f0', o: '#e8833a', b: '#4a8ad4', R: '#e83a2a', s: '#f0d0b0', e: '#1a1a1a', p: '#f0f0f0', J: '#c46a2a', r: '#c43a3a', k: '#222222' },
    rows: [
      '.....www........',
      '....ooooooo.....',
      '...ooooooooo....',
      '..bbooooooobb...',
      '.bbbsssssssbbb..',
      '.bbpesssepbb....',
      '..bbssRRssbb....',
      '...ssppss.......',
      '...JJJJJJJJ.....',
      '..sJJrwrwJJs....',
      '..sJJJJJJJJs....',
      '...JJJJJJJJ.....',
      '...rwrwrwrw.....',
      '...rwr..wrw.....',
      '...rwr..wrw.....',
      '...kk....kk.....',
    ],
  },

  roger: {
    pal: { h: '#1a1a22', s: '#e8b88a', e: '#1a1a1a', r: '#b8302a', g: '#e8b83a', w: '#f0f0f0', k: '#26262e', n: '#6a4a2a' },
    rows: [
      '................',
      '....hhhhhhh.....',
      '...hhhhhhhhh....',
      '...hhhhhhhhh....',
      '...ssssssss.....',
      '...sessssess....',
      '..hhhhhhhhhhhh..',
      '....ssssss......',
      '..grrrrrrrrg....',
      '.sgrrwwwwrrgs...',
      '.s.rrwwwwrr.s...',
      '...rrrrrrrr.....',
      '...kkkkkkkk.....',
      '...kkk..kkk.....',
      '...kkk..kkk.....',
      '...nn....nn.....',
    ],
  },

  rocks: {
    pal: { h: '#15151d', s: '#c9956a', E: '#e83a3a', d: '#2a2433', R: '#7a2a3a', k: '#1a1a1a', p: '#4a2d6e' },
    rows: [
      '.h.h..hhh..h.h..',
      '.hhhhhhhhhhhhh..',
      '..hhhhhhhhhhh...',
      '..hhhhhhhhhhh...',
      '..hhssssssshh...',
      '..hsEssssEsh....',
      '..hhssssssshh...',
      '...h.ssss.h.....',
      '..pddddddddp....',
      '.psddddddddsp...',
      '.psddRRRRddsp...',
      '..pdddddddddp...',
      '...dddddddd.....',
      '...ddd..ddd.....',
      '...ddd..ddd.....',
      '...kk....kk.....',
    ],
  },

  imu: {
    pal: { k: '#14101f', K: '#2a2440', E: '#e8d44a', p: '#4a2d6e' },
    rows: [
      '..k....k....k...',
      '..kk..kkk..kk...',
      '..kkkkkkkkkkk...',
      '..kkkkkkkkkkk...',
      '..kkEkkkkEkkk...',
      '..kkkkkkkkkkk...',
      '...kkkkkkkkk....',
      '..kkkkkkkkkkk...',
      '.KkkkkkkkkkkkK..',
      '.KkkkpppkkkkK...',
      '.KkkkpppkkkkK...',
      '.KkkkkkkkkkkK...',
      '..kkkkkkkkkkk...',
      '..kkkkkkkkkkk...',
      '...kkkkkkkkk....',
      '....kkkkkkk.....',
    ],
  },

  loki: {
    pal: { o: '#d9b888', y: '#e8c95a', Y: '#f5dc8a', s: '#e8b88a', e: '#1a1a1a', f: '#8a6a4a', F: '#a98a64', g: '#3a6a45', m: '#9aa8b8', t: '#6a4a2a', k: '#26262e' },
    rows: [
      '.o..........o...',
      '.oo.yyyyyyy.oo..',
      '..oyyyyyyyyyo...',
      '...yyyyyyyyy....',
      '...ssssssss..mmm',
      '...sessssess.mmm',
      '..YssssssssY..t.',
      '..Y.ssssss.Y..t.',
      '..YfFffffFfY..t.',
      '.sfFggggggFfs.t.',
      '.sf.gggggg.fs.t.',
      '....gggggg....t.',
      '...kkkkkkkk...t.',
      '...kkk..kkk...t.',
      '...kkk..kkk.....',
      '...ff....ff.....',
    ],
  },
};

/* Validate sprite grids: 16 rows x 16 cols, all chars in palette. */
function validateSprites() {
  const errors = [];
  for (const c of CHARACTERS) {
    const sp = SPRITES[c.id];
    if (!sp) { errors.push(`${c.id}: missing sprite`); continue; }
    if (sp.rows.length !== 16) errors.push(`${c.id}: ${sp.rows.length} rows`);
    sp.rows.forEach((row, i) => {
      if (row.length !== 16) errors.push(`${c.id} row ${i}: length ${row.length}`);
      for (const ch of row) {
        if (ch !== '.' && !sp.pal[ch]) errors.push(`${c.id} row ${i}: unknown '${ch}'`);
      }
    });
  }
  return errors;
}

/* Draw a sprite onto a canvas. flip=true mirrors horizontally. */
function drawSprite(charId, canvas, scale, flip) {
  const sp = SPRITES[charId];
  if (!sp || !canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 16 * scale;
  canvas.height = 16 * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  sp.rows.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      const ch = row[x];
      if (ch === '.' || !sp.pal[ch]) continue;
      ctx.fillStyle = sp.pal[ch];
      const dx = flip ? (15 - x) : x;
      ctx.fillRect(dx * scale, y * scale, scale, scale);
    }
  });
}

/* Build a fresh canvas element with the sprite drawn. */
function makeSpriteCanvas(charId, scale, flip) {
  const c = document.createElement('canvas');
  c.className = 'sprite-canvas';
  drawSprite(charId, c, scale, flip);
  return c;
}

if (typeof module !== 'undefined') {
  module.exports.SPRITES = SPRITES;
  module.exports.validateSprites = validateSprites;
}
