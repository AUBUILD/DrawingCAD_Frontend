export const T = {
  bg0: '#090d18',
  bg1: '#0f1525',
  bg2: '#141c2e',
  bg3: '#1a2338',
  bg4: '#1f2b40',
  line: '#1e2d48',
  lineHi: '#2a3d5c',
  teal: '#00d4a8',
  tealDk: '#00a882',
  tealBg: 'rgba(0,212,168,0.07)',
  tealBd: 'rgba(0,212,168,0.2)',
  blue: '#5b8ef0',
  blueBg: 'rgba(91,142,240,0.08)',
  blueBd: 'rgba(91,142,240,0.22)',
  gold: '#f0a030',
  goldBg: 'rgba(240,160,48,0.08)',
  goldBd: 'rgba(240,160,48,0.22)',
  red: '#ff4d6a',
  redBg: 'rgba(255,77,106,0.08)',
  redBd: 'rgba(255,77,106,0.25)',
  green: '#3ddc84',
  text: '#ccd8f0',
  sub: '#627494',
  dim: '#2e3f5c',
} as const;

export const NIVEL_META = {
  Piso: { color: T.teal, bg: T.tealBg, bd: T.tealBd, prefix: 'VT' },
  Sótano: { color: T.blue, bg: T.blueBg, bd: T.blueBd, prefix: 'VS' },
  Azotea: { color: T.gold, bg: T.goldBg, bd: T.goldBd, prefix: 'VA' },
} as const;

