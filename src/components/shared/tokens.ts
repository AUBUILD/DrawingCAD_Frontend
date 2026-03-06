import { T, NIVEL_META } from '../../styles/tokens';

export type NivelType = 'Piso' | 'Sótano' | 'Azotea';

export const C = {
  bg: T.bg0,
  surface: T.bg2,
  card: T.bg3,
  cardHi: T.bg4,
  border: T.line,
  teal: T.teal,
  tealD: T.tealDk,
  tealBg: T.tealBg,
  tealBd: T.tealBd,
  blue: T.blue,
  orange: T.gold,
  red: T.red,
  redBg: T.redBg,
  redBd: T.redBd,
  text: T.text,
  sub: T.sub,
  dim: T.dim,
} as const;

export const NIVEL_COLOR: Record<NivelType, string> = {
  Piso: NIVEL_META.Piso.color,
  Sótano: NIVEL_META.Sótano.color,
  Azotea: NIVEL_META.Azotea.color,
};

export const PREFIX: Record<NivelType, string> = {
  Piso: NIVEL_META.Piso.prefix,
  Sótano: NIVEL_META.Sótano.prefix,
  Azotea: NIVEL_META.Azotea.prefix,
};

export const NIVEL_TYPES: NivelType[] = ['Piso', 'Sótano', 'Azotea'];

export const ORDINALS = [
  '1er','2do','3er','4to','5to','6to','7mo','8vo','9no','10mo',
  '11vo','12vo','13vo','14vo','15vo','16vo','17vo','18vo','19vo','20vo',
  '21vo','22vo','23vo','24vo','25vo','26vo','27vo','28vo','29vo','30vo',
] as const;

export type Ordinal = typeof ORDINALS[number];

export const PAD = (n: number) => String(n).padStart(2, '0');
export const bCode = (type: NivelType, num: number) => `${PREFIX[type]}-${PAD(num)}`;
export const ordIdx = (s: string) => ORDINALS.indexOf(s as Ordinal);
