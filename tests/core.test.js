const test = require('node:test');
const assert = require('node:assert/strict');
const media = require('../src/media');
test('provider detection', () => {
  assert.equal(media.providerFor('https://youtu.be/abc').name, 'youtube');
  assert.equal(media.providerFor('https://www.tiktok.com/@x/video/1').name, 'tiktok');
  assert.equal(media.providerFor('https://example.com/a.mp4').name, 'direct');
});
test('gif API exists', () => {
  assert.equal(typeof media.gif.toGif, 'function');
  assert.equal(typeof media.gif.fromUrl, 'function');
});
