// Use the browser's unmodified classifier on a sequence of raw 48×48 grayscale frames.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectDir = process.argv[2] || path.join(__dirname, '..');
const documentStub = {
  readyState: 'loading',
  addEventListener() {},
  createElement() {return {getContext() {return {};}};},
};
const ctx = vm.createContext({window: {}, document: documentStub});
for (const filename of ['cv_model.js', 'vision.js']) {
  const script = fs.readFileSync(path.join(projectDir, filename), 'utf8');
  vm.runInContext(script, ctx, {filename});
}
const infer = ctx.window.LUMEN_CV_TEST.cvInferPixels;
const bytes = fs.readFileSync(0);
const frameSize = 48 * 48;
if (bytes.length % frameSize !== 0) throw new Error('Incomplete grayscale frame');
const rgba = new Uint8ClampedArray(frameSize * 4);
const labels = [];
for (let start = 0; start < bytes.length; start += frameSize) {
  for (let i = 0; i < frameSize; i++) {
    const v = bytes[start + i];
    rgba.set([v, v, v, 255], 4 * i);
  }
  labels.push(infer(rgba).kind);
}
process.stdout.write(JSON.stringify(labels));
