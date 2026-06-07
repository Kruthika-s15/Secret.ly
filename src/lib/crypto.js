const FERNET_VERSION = 0x80;
const PBKDF2_ITERATIONS = 200000;
const SALT_LEN = 16;

function getSubtle() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is not available');
  }
  return globalThis.crypto.subtle;
}

function randomBytes(n) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

async function pbkdf2(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await getSubtle().importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await getSubtle().deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

function pkcs7Pad(data, blockSize = 16) {
  const pad = blockSize - (data.length % blockSize);
  const out = new Uint8Array(data.length + pad);
  out.set(data);
  out.fill(pad, data.length);
  return out;
}

function pkcs7Unpad(data) {
  const pad = data[data.length - 1];
  if (pad < 1 || pad > 16) throw new Error('Invalid padding');
  for (let i = data.length - pad; i < data.length; i++) {
    if (data[i] !== pad) throw new Error('Invalid padding');
  }
  return data.slice(0, data.length - pad);
}

function writeUint32BE(view, offset, value) {
  view.setUint32(offset, value, false);
}

function readUint32BE(view, offset) {
  return view.getUint32(offset, false);
}

async function importAesKey(rawKey) {
  return getSubtle().importKey('raw', rawKey, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
}

async function importHmacKey(rawKey) {
  return getSubtle().importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function fernetEncrypt(plaintext, signingKey, encryptionKey) {
  const iv = randomBytes(16);
  const timestamp = Math.floor(Date.now() / 1000);
  const ts = new Uint8Array(8);
  const dv = new DataView(ts.buffer);
  dv.setUint32(0, Math.floor(timestamp / 0x100000000), false);
  dv.setUint32(4, timestamp >>> 0, false);

  const aesKey = await importAesKey(encryptionKey);
  const padded = pkcs7Pad(plaintext);
  const ciphertext = new Uint8Array(
    await getSubtle().encrypt({ name: 'AES-CBC', iv }, aesKey, padded)
  );

  const header = new Uint8Array(1 + 8 + 16 + ciphertext.length);
  header[0] = FERNET_VERSION;
  header.set(ts, 1);
  header.set(iv, 9);
  header.set(ciphertext, 25);

  const hmacKey = await importHmacKey(signingKey);
  const sig = new Uint8Array(
    await getSubtle().sign('HMAC', hmacKey, header)
  );

  const token = new Uint8Array(header.length + 32);
  token.set(header);
  token.set(sig, header.length);
  return token;
}

async function fernetDecrypt(token, signingKey, encryptionKey) {
  if (token.length < 57) throw new Error('Invalid token');
  if (token[0] !== FERNET_VERSION) throw new Error('Invalid Fernet version');

  const header = token.slice(0, token.length - 32);
  const sig = token.slice(token.length - 32);

  const hmacKey = await importHmacKey(signingKey);
  const valid = await getSubtle().verify('HMAC', hmacKey, sig, header);
  if (!valid) throw new Error('HMAC verification failed');

  const iv = header.slice(9, 25);
  const ciphertext = header.slice(25);

  const aesKey = await importAesKey(encryptionKey);
  const decrypted = new Uint8Array(
    await getSubtle().decrypt({ name: 'AES-CBC', iv }, aesKey, ciphertext)
  );
  return pkcs7Unpad(decrypted);
}

export async function encryptMessage(message, password) {
  const salt = randomBytes(SALT_LEN);
  const derived = await pbkdf2(password, salt);
  const signingKey = derived.slice(0, 16);
  const encryptionKey = derived.slice(16, 32);

  const plaintext = new TextEncoder().encode(message);
  const token = await fernetEncrypt(plaintext, signingKey, encryptionKey);

  const innerLen = SALT_LEN + token.length;
  const inner = new Uint8Array(4 + innerLen);
  writeUint32BE(new DataView(inner.buffer), 0, innerLen);
  inner.set(salt, 4);
  inner.set(token, 4 + SALT_LEN);
  return inner;
}

export async function decryptMessage(payload, password) {
  if (payload.length < 4 + SALT_LEN + 57) {
    throw new Error('Payload too short');
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const innerLen = readUint32BE(view, 0);
  if (payload.length !== 4 + innerLen) {
    throw new Error('Invalid payload length');
  }

  const salt = payload.slice(4, 4 + SALT_LEN);
  const token = payload.slice(4 + SALT_LEN);

  const derived = await pbkdf2(password, salt);
  const signingKey = derived.slice(0, 16);
  const encryptionKey = derived.slice(16, 32);

  const plaintext = await fernetDecrypt(token, signingKey, encryptionKey);
  return new TextDecoder().decode(plaintext);
}
