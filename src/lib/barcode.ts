// Штрихкоды без внешних библиотек: Code 128 (B) для любых строк и EAN-13 для цифр.
// Возвращают SVG-строку, которую можно вставить в печатную форму.

const C128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

/** Ширины полос и пробелов (в модулях) для Code 128B. */
export function code128Widths(text: string): number[] {
  const chars = [...text].map((c) => {
    const code = c.charCodeAt(0);
    return code >= 32 && code <= 126 ? code - 32 : 0;
  });
  const START_B = 104;
  let sum = START_B;
  chars.forEach((v, i) => (sum += v * (i + 1)));
  const codes = [START_B, ...chars, sum % 103, 106];
  return codes.flatMap((c) => [...C128[c]].map(Number));
}

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13Check(d12: string): number {
  const s = [...d12].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 ? 3 : 1), 0);
  return (10 - (s % 10)) % 10;
}

export const isEan13 = (s: string) => /^\d{13}$/.test(s) && ean13Check(s.slice(0, 12)) === Number(s[12]);

/** Внутренний штрихкод EAN-13 с префиксом 2 (для своих товаров): 2 + 11 цифр номера + контрольная. */
export function internalEan13(n: number): string {
  const d12 = "2" + String(n).padStart(11, "0").slice(-11);
  return d12 + ean13Check(d12);
}

function ean13Bits(code: string): string {
  const first = Number(code[0]);
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (EAN_PARITY[first][i - 1] === "L" ? EAN_L : EAN_G)[Number(code[i])];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += EAN_R[Number(code[i])];
  return bits + "101";
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * SVG штрихкода. width/height в мм (как в печатных формах LiveSklad: <Штрихкод(100:20)> — ширина 100 px, высота 20 px;
 * здесь просто пропорции). Подпись с цифрами снизу.
 */
export function barcodeSvg(text: string, opts: { width?: number; height?: number; label?: boolean } = {}): string {
  const value = (text ?? "").trim();
  if (!value) return "";
  const height = opts.height ?? 40;
  const label = opts.label ?? true;
  let bars: { x: number; w: number }[] = [];
  let total = 0;
  if (isEan13(value)) {
    const bits = ean13Bits(value);
    total = bits.length;
    for (let i = 0; i < bits.length; i++) if (bits[i] === "1") bars.push({ x: i, w: 1 });
  } else {
    const widths = code128Widths(value);
    let x = 0;
    widths.forEach((w, i) => {
      if (i % 2 === 0) bars.push({ x, w });
      x += w;
    });
    total = x;
  }
  const quiet = 10;
  const W = total + quiet * 2;
  const textH = label ? 12 : 0;
  const H = height + textH;
  bars = bars.map((b) => ({ ...b, x: b.x + quiet }));
  const rects = bars.map((b) => `<rect x="${b.x}" y="0" width="${b.w}" height="${height}"/>`).join("");
  const txt = label ? `<text x="${W / 2}" y="${H - 1}" font-size="11" text-anchor="middle" font-family="Arial, sans-serif">${esc(value)}</text>` : "";
  const style = opts.width ? `width:${opts.width}px;height:${Math.round((opts.width * H) / W)}px` : `height:${H}px`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="${style};display:inline-block" fill="#000">${rects}${txt}</svg>`;
}
