/**
 * EMVCo merchant-presented QR (what Fonepay and NepalPay QR use). Turns the merchant's own printed QR text into a QR for one amount and
 * one reference: tag 01 becomes 12 (dynamic), tag 54 is the amount, tag 62 carries our reference, and the CRC (tag 63) is written again.
 */
export function parseTlv(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const tag = s.slice(i, i + 2), len = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len) || i + 4 + len > s.length) throw new Error('That is not a valid QR text');
    out.push([tag, s.slice(i + 4, i + 4 + len)]);
    i += 4 + len;
  }
  return out;
}
const tlv = (tag, value) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

export function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function dynamicQr({ template, amount, ref }) {
  const fields = parseTlv(template.trim()).filter(([t]) => !['01', '54', '63'].includes(t));
  const old = fields.find(([t]) => t === '62');
  const kept = old ? parseTlv(old[1]).filter(([t]) => !['01', '05'].includes(t)) : [];
  const extra = [['01', ref], ['05', ref], ...kept].map(([t, v]) => tlv(t, v)).join('');
  const rest = fields.filter(([t]) => t !== '62');
  rest.push(['01', '12'], ['54', Number(amount).toFixed(2)], ['62', extra]);
  rest.sort((a, b) => Number(a[0]) - Number(b[0]));
  const body = rest.map(([t, v]) => tlv(t, v)).join('') + '6304';
  return body + crc16(body);
}

/**
 * A Fonepay QR built from the merchant's own details, with no API login. Ported from akashpoudelnp/nepali-payment-qr-generator (FonepayQrGenerator).
 * Tag 26 is either separate ids (fonepay.com, merchant id, terminal id) or one combined identifier (sub-tag 07). Tag 62 holds terminal, txn id, remarks.
 */
export function fonepayQr({ amount, fonepayId, terminalId, tag26Id, mcc = '5814', name = 'Sadhai Coffee', city = 'Kathmandu', txnId, remarks = 'Payment', country = 'NP' }) {
  const l = (v) => String(v.length).padStart(2, '0');
  const fp = tag26Id ? `0011fonepay.com07${l(tag26Id)}${tag26Id}` : `0011fonepay.com01${l(fonepayId)}${fonepayId}02${l(terminalId)}${terminalId}`;
  const amountStr = Number(amount).toFixed(2);
  const add = `07${l(terminalId)}${terminalId}02${l(txnId)}${txnId}08${l(remarks)}${remarks}`;
  const body = '000201' + '010212' + `26${l(fp)}${fp}` + `5204${mcc}` + '5303524' + `54${l(amountStr)}${amountStr}` + `5802${country}`
    + `59${l(name)}${name}` + `60${l(city)}${city}` + `62${l(add)}${add}` + '6304';
  return body + crc16(body);
}
