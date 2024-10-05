# LordTubeMaster
### Live YouTube processing in client-side JS using self screen capture

Demo: https://eyaler.github.io/LordTubeMaster/#dQw4w9WgXcQ

Note as of late 2024 this is only supported on *Chromium desktop* (e.g. Chrome, Edge).

Enable graphics/hardware acceleration browser setting to reduce lag.
Particularly for the WebGPU examples - make sure your system graphics settings for the browser uses high performance / discrete GPU.

To allow fullscreen zoom of output (with right-click) enable: `chrome://flags/#element-capture` (*Google Chrome 121+*), or 
`chrome://flags/#enable-experimental-web-platform-features` (*Chromium 121+*), and relaunch the browser.

You can browse the effects with `Alt+↑` and `Alt+↓`

The code demos usages with Wasm ([MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/guide)),
WebGPU ([ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html), [TensorFlow.js](https://www.tensorflow.org/js), [Transformers.js](https://huggingface.co/docs/transformers.js/index)),
WebGL ([Three.js](https://threejs.org/), [SwissGL](https://google.github.io/swissgl/)), and VanillaJS.

#### Known issues:
1. Resolution of captured media is doubled for smaller frames: https://github.com/screen-share/element-capture/issues/44

<br>

#### Demo Video: 

[Demo video](https://github.com/eyaler/LordTubeMaster/assets/4436747/2352969c-889d-478e-b386-8bdf6452a797)

<br>

#### High-level architecture and modules:
![Architecture](media/LordTubeMaster.svg)
