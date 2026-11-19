/** Paleta de la oficina. Tonos calidos y apagados para que los colores de los agentes resalten. */
export const PAL = {
  background: '#151823',
  outline: '#1d1d2b',

  floorA: '#dcd3c1',
  floorB: '#d3c9b5',
  floorGrout: '#c4b9a3',
  plankA: '#a8774b',
  plankB: '#9c6d43',
  plankSeam: '#7d5433',
  runner: '#4f7a7c',
  runnerBorder: '#3b5d60',
  runnerStripe: '#6a9a92',

  wallTop: '#2d3350',
  wallTopEdge: '#40496e',
  wallFace: '#5d6b94',
  wallFaceDark: '#52608a',
  baseboard: '#2b3250',

  glass: '#a9d8e8',
  glassShine: '#e3f5fb',
  frame: '#3a4466',

  woodTop: '#c79262',
  woodTopLight: '#d6a676',
  woodFront: '#8f5f3a',
  woodEdge: '#6b4428',
  shadow: 'rgba(29, 29, 43, 0.28)',

  chair: '#363b52',
  chairLight: '#4a5070',
  ceoChair: '#5a2f2f',
  ceoChairLight: '#774040',

  monitorFrame: '#2b2f3a',
  screenOff: '#1c2230',
  screenOn: '#15324f',
  screenAlert: '#5c3e0e',
  screenLines: ['#6fe3ff', '#ffd166', '#9be564', '#f78fb3'],
  led: '#5ee08a',

  keyboard: '#d9dce3',
  keyboardDark: '#a6abb8',
  paper: '#f6f3ea',
  paperLine: '#b9b4a6',

  rug: '#6f3553',
  rugBorder: '#c9a227',
  rugInner: '#834064',

  plantPot: '#b5652d',
  plantPotDark: '#8a4a1f',
  leaf: '#4f9a4a',
  leafLight: '#73bd5c',
  leafDark: '#357a3c',

  counterTop: '#ece6d9',
  machine: '#3b3f4f',
  machineLight: '#e2574c',
  cooler: '#8fd0f0',
  coolerBase: '#e8ebf0',

  whiteboard: '#f4f6f8',
  marker: ['#e2574c', '#3b82c4', '#3f9b55'],
  sky: '#9fd6f2',
  skyLight: '#cdeefc',
  books: ['#c0504d', '#4f81bd', '#9bbb59', '#e8b04a', '#8064a2'],

  alert: '#ffcc33',
  alertDark: '#7a4b00',
  bubble: '#ffffff',
  tie: '#b8332e',
  eye: '#1d1d2b',

  select: '#ffd166',

  // Capa de texto (pantalla)
  chipBg: 'rgba(21, 24, 35, 0.86)',
  chipText: '#f4f1ea',
  chipSubtle: 'rgba(244, 241, 234, 0.7)',
  plaqueBg: '#f1e7cf',
  plaqueText: '#3a2a18',
  bubbleText: '#1d1d2b',
  bubbleBorder: '#1d1d2b',
} as const;

export const FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** Color de respaldo si agent.color no es un hex valido. */
export const FALLBACK_AGENT_COLOR = '#5b8def';
