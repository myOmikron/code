//! The OpenCV.js module behind a plain ES module.
//!
//! `@techstark/opencv-js` is a CommonJS build whose export is the emscripten promise. Importing
//! it dynamically hands the bundler's CommonJS interop object to the import promise, and that
//! object inherits `Promise.prototype`, so the promise takes it for a thenable and calls `then`
//! on something that is no promise. Re-exporting it from an ES module gives the dynamic import a
//! real module namespace to resolve with instead.
import cv from "@techstark/opencv-js";

export default cv;
