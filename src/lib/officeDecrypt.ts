/**
 * 암호로 잠긴 엑셀(.xlsx) 복호화 — 브라우저 내장 Web Crypto만 사용 (파일·암호가 기기 밖으로 나가지 않음)
 *
 * 왜 필요한가: SheetJS 무료판(xlsx 0.18.x)은 read()에 password를 넘겨도 암호화된 OOXML을
 * 풀지 못하고 항상 "File is password-protected"를 던진다. 그래서 암호가 맞아도 틀렸다고 보였다.
 *
 * 지원 (MS-OFFCRYPTO / ECMA-376)
 *  - Standard Encryption (v2.2·3.2·4.2, AES-128/192/256 · SHA-1)  ← 토스뱅크 등
 *  - Agile Encryption    (v4.4, AES-CBC · SHA-1/256/384/512)      ← 최신 Office 기본값
 */
import { CFB } from 'xlsx'

/** 암호가 틀림 (검증값 불일치) */
export class OfficeWrongPasswordError extends Error {
  constructor() { super('wrong-password'); this.name = 'OfficeWrongPasswordError' }
}
/** 지원하지 않는 암호화 방식 (예: 구형 RC4) */
export class OfficeUnsupportedError extends Error {
  constructor(detail: string) { super(`unsupported-encryption: ${detail}`); this.name = 'OfficeUnsupportedError' }
}

type Bytes = Uint8Array<ArrayBuffer>

const subtle = () => {
  const s = globalThis.crypto?.subtle
  if (!s) throw new OfficeUnsupportedError('이 브라우저는 Web Crypto를 지원하지 않습니다')
  return s
}

const u8 = (n: number): Bytes => new Uint8Array(new ArrayBuffer(n))
function concat(...parts: Uint8Array[]): Bytes {
  const out = u8(parts.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}
const le32 = (n: number): Bytes => { const b = u8(4); new DataView(b.buffer).setUint32(0, n, true); return b }
const utf16le = (s: string): Bytes => {
  const b = u8(s.length * 2)
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[i * 2] = c & 0xff; b[i * 2 + 1] = c >> 8 }
  return b
}
const b64 = (s: string): Bytes => {
  const bin = atob(s)
  const out = u8(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])
const copy = (a: Uint8Array): Bytes => { const b = u8(a.length); b.set(a); return b }

async function digest(alg: string, data: Bytes): Promise<Bytes> {
  return new Uint8Array(await subtle().digest(alg, data))
}

// ── AES (Web Crypto는 패딩 없는 CBC/ECB 복호화를 직접 지원하지 않아 우회) ─────
// 마지막 암호문 블록 뒤에 "복호화하면 PKCS#7 패딩(0x10×16)이 되는 블록"을 붙여
// Web Crypto의 패딩 검사를 통과시킨다. 결과에서 그 패딩 블록은 자동 제거된다.
async function aesKey(raw: Bytes) {
  return subtle().importKey('raw', raw, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt'])
}

async function aesCbcDecryptRaw(key: CryptoKey, iv: Bytes, data: Bytes): Promise<Bytes> {
  if (data.length === 0) return u8(0)
  if (data.length % 16 !== 0) throw new OfficeUnsupportedError('암호문 길이가 블록 크기의 배수가 아닙니다')
  const last = data.slice(data.length - 16)
  const pad = u8(16).fill(16)
  const padCt = new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: last }, key, pad)).slice(0, 16)
  return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv }, key, concat(data, padCt)))
}

/** AES-ECB 복호화 = IV 0인 CBC 복호화 후, 각 블록을 직전 암호문 블록과 XOR해 체인 효과 제거 */
async function aesEcbDecrypt(key: CryptoKey, data: Bytes): Promise<Bytes> {
  const out = await aesCbcDecryptRaw(key, u8(16), data)
  for (let i = 16; i < out.length; i++) out[i] ^= data[i - 16]
  return out
}

// ── 컨테이너 ─────────────────────────────────────────────────────────────────
interface Container { info: Bytes; pkg: Bytes }

function openContainer(buf: ArrayBuffer | Uint8Array): Container | null {
  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  // CFB(OLE) 시그니처 D0 CF 11 E0 — 일반 xlsx(zip)는 여기서 바로 탈락
  if (data.length < 8 || data[0] !== 0xd0 || data[1] !== 0xcf || data[2] !== 0x11 || data[3] !== 0xe0) return null
  try {
    const cfb = CFB.read(data, { type: 'array' })
    const info = CFB.find(cfb, 'EncryptionInfo')
    const pkg  = CFB.find(cfb, 'EncryptedPackage')
    if (!info?.content || !pkg?.content) return null
    return { info: copy(info.content as Uint8Array), pkg: copy(pkg.content as Uint8Array) }
  } catch {
    return null
  }
}

/** 암호로 잠긴 xlsx(OOXML)인지. 구형 .xls(BIFF) 암호는 여기 해당하지 않는다. */
export function isEncryptedOOXML(buf: ArrayBuffer | Uint8Array): boolean {
  return openContainer(buf) !== null
}

/** 패키지 앞 8바이트(평문 크기, uint64 LE) */
function streamSize(pkg: Bytes): number {
  const dv = new DataView(pkg.buffer, pkg.byteOffset, 8)
  return dv.getUint32(0, true) + dv.getUint32(4, true) * 2 ** 32
}

// ── Standard Encryption (MS-OFFCRYPTO 2.3.4.5 ~ 2.3.4.9) ──────────────────────
async function decryptStandard(info: Bytes, pkg: Bytes, password: string): Promise<Bytes> {
  const dv = new DataView(info.buffer, info.byteOffset, info.byteLength)
  const headerSize = dv.getUint32(8, true)
  const h = 12
  const algID   = dv.getUint32(h + 8, true)
  const algHash = dv.getUint32(h + 12, true)
  const keyBits = dv.getUint32(h + 16, true)

  const AES: Record<number, number> = { 0x660e: 128, 0x660f: 192, 0x6610: 256 }
  if (!AES[algID]) throw new OfficeUnsupportedError(`Standard algID 0x${algID.toString(16)} (AES 아님)`)
  if (algHash !== 0x8004 && algHash !== 0) throw new OfficeUnsupportedError(`Standard hash 0x${algHash.toString(16)}`)
  const keyLen = (keyBits || AES[algID]) / 8

  const v = h + headerSize
  const saltSize = dv.getUint32(v, true)
  const salt = info.slice(v + 4, v + 4 + saltSize)
  const encVerifier = info.slice(v + 4 + saltSize, v + 4 + saltSize + 16)
  const verifierHashSize = dv.getUint32(v + 4 + saltSize + 16, true)
  const encVerifierHash = info.slice(v + 8 + saltSize + 16, v + 8 + saltSize + 16 + 32)

  // 키 유도: H0 = SHA1(salt + pw), 50,000회 반복, 블록 0 결합 후 0x36/0x5C 확장
  let H = await digest('SHA-1', concat(salt, utf16le(password)))
  for (let i = 0; i < 50000; i++) H = await digest('SHA-1', concat(le32(i), H))
  const Hf = await digest('SHA-1', concat(H, le32(0)))
  const b1 = u8(64).fill(0x36), b2 = u8(64).fill(0x5c)
  for (let i = 0; i < Hf.length; i++) { b1[i] ^= Hf[i]; b2[i] ^= Hf[i] }
  const raw = concat(await digest('SHA-1', b1), await digest('SHA-1', b2)).slice(0, keyLen)
  const key = await aesKey(raw)

  // 암호 검증: SHA1(복호화한 verifier) == 복호화한 verifierHash
  const verifier = await aesEcbDecrypt(key, encVerifier)
  const vHash    = (await aesEcbDecrypt(key, encVerifierHash)).slice(0, verifierHashSize)
  if (!eq(await digest('SHA-1', verifier), vHash)) throw new OfficeWrongPasswordError()

  const size = streamSize(pkg)
  return (await aesEcbDecrypt(key, pkg.slice(8))).slice(0, size)
}

// ── Agile Encryption (MS-OFFCRYPTO 2.3.4.10 ~ 2.3.4.15) ────────────────────────
const HASH: Record<string, { name: string; size: number }> = {
  SHA1: { name: 'SHA-1', size: 20 }, 'SHA-1': { name: 'SHA-1', size: 20 },
  SHA256: { name: 'SHA-256', size: 32 }, SHA384: { name: 'SHA-384', size: 48 }, SHA512: { name: 'SHA-512', size: 64 },
}

/** XML에서 특정 태그의 속성들을 읽는다 (DOMParser 없이도 동작) */
function attrs(xml: string, tag: string): Record<string, string> {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}\\b([^>]*)>`))
  if (!m) throw new OfficeUnsupportedError(`Agile XML에 ${tag} 없음`)
  const out: Record<string, string> = {}
  for (const a of m[1].matchAll(/(\w+)="([^"]*)"/g)) out[a[1]] = a[2]
  return out
}

const fit = (b: Uint8Array, n: number, fill: number): Bytes => {
  const out = u8(n).fill(fill)
  out.set(b.slice(0, n))
  return out
}

async function decryptAgile(info: Bytes, pkg: Bytes, password: string): Promise<Bytes> {
  const xml = new TextDecoder('utf-8').decode(info.slice(8))
  const kd = attrs(xml, 'keyData')
  const ek = attrs(xml, 'encryptedKey')
  if (kd.cipherAlgorithm && kd.cipherAlgorithm !== 'AES') throw new OfficeUnsupportedError(`Agile cipher ${kd.cipherAlgorithm}`)
  if (kd.cipherChaining && kd.cipherChaining !== 'ChainingModeCBC') throw new OfficeUnsupportedError(`Agile chaining ${kd.cipherChaining}`)

  const hk = HASH[ek.hashAlgorithm]
  const hd = HASH[kd.hashAlgorithm]
  if (!hk || !hd) throw new OfficeUnsupportedError(`Agile hash ${ek.hashAlgorithm}/${kd.hashAlgorithm}`)

  const spin = Number(ek.spinCount)
  const keyLen = Number(ek.keyBits) / 8
  const blockSize = Number(ek.blockSize) || 16
  const pwSalt = b64(ek.saltValue)

  // 비밀번호 해시: H0 = H(salt + pw), spinCount회 반복
  let H = await digest(hk.name, concat(pwSalt, utf16le(password)))
  for (let i = 0; i < spin; i++) H = await digest(hk.name, concat(le32(i), H))

  const blockKey = (bk: number[]) => digest(hk.name, concat(H, new Uint8Array(bk))).then(d => fit(d, keyLen, 0x36))
  const iv = fit(pwSalt, blockSize, 0x36)
  const dec = async (bk: number[], ct: Bytes) => aesCbcDecryptRaw(await aesKey(await blockKey(bk)), iv, ct)

  // 암호 검증
  const input = (await dec([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79], b64(ek.encryptedVerifierHashInput)))
    .slice(0, Number(ek.saltSize) || 16)
  const expected = (await dec([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e], b64(ek.encryptedVerifierHashValue)))
    .slice(0, hk.size)
  if (!eq(await digest(hk.name, input), expected)) throw new OfficeWrongPasswordError()

  // 실제 데이터 키
  const secret = (await dec([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6], b64(ek.encryptedKeyValue)))
    .slice(0, Number(kd.keyBits) / 8)
  const dataKey = await aesKey(secret)
  const kdSalt = b64(kd.saltValue)
  const kdBlock = Number(kd.blockSize) || 16

  // 패키지: 4096바이트 세그먼트마다 IV = H(keyData.salt + 세그먼트번호)
  const size = streamSize(pkg)
  const body = pkg.slice(8)
  const parts: Uint8Array[] = []
  for (let off = 0, i = 0; off < body.length; off += 4096, i++) {
    const seg = body.slice(off, Math.min(off + 4096, body.length))
    const segIv = fit(await digest(hd.name, concat(kdSalt, le32(i))), kdBlock, 0x36)
    parts.push(await aesCbcDecryptRaw(dataKey, segIv, seg))
  }
  return concat(...parts).slice(0, size)
}

/**
 * 암호로 잠긴 xlsx를 풀어 일반 xlsx(zip) 바이트를 돌려준다.
 * @throws OfficeWrongPasswordError 암호 불일치
 * @throws OfficeUnsupportedError   지원하지 않는 방식
 */
export async function decryptOOXML(buf: ArrayBuffer | Uint8Array, password: string): Promise<Uint8Array> {
  const c = openContainer(buf)
  if (!c) throw new OfficeUnsupportedError('암호화된 엑셀 파일이 아닙니다')
  const dv = new DataView(c.info.buffer, c.info.byteOffset, c.info.byteLength)
  const major = dv.getUint16(0, true), minor = dv.getUint16(2, true)

  if (major === 4 && minor === 4) return decryptAgile(c.info, c.pkg, password)
  if ((major === 2 || major === 3 || major === 4) && minor === 2) return decryptStandard(c.info, c.pkg, password)
  throw new OfficeUnsupportedError(`EncryptionInfo v${major}.${minor}`)
}
