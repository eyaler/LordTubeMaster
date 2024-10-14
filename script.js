const debug_fps = true
const loop_secs = 10
const max_res_width = 1920

import load_video from './utils/videoloader.js'
import toggle_fullscreen from './utils/fullscreen.js'

import {
    PoseLandmarker,
    FaceLandmarker,
    ImageSegmenter,
    FilesetResolver,
    DrawingUtils
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/vision_bundle.mjs'
const mediapipe_wasm_url = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm'

import {AutoModel, AutoProcessor, RawImage, env as transformersEnv} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0-alpha.20/dist/transformers.min.js'

import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.21.0/dist/tf.min.js'
import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgpu@4.21.0/dist/tf-backend-webgpu.min.js'

import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.webgpu.min.mjs'
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/'

import SwissGL from './libs/swissgl/swissgl.mjs'
import DotCamera from './models/dotcamera.js'

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js'
import RuttEtraIzer from './models/ruttetraizer.js'

function getGPUInfo() {
  const gl = document.createElement('canvas').getContext('webgl')
  if (!gl)
    return 'Failed getting GPU info'
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
}
console.log(getGPUInfo())

const canvasCtx = canvas.getContext('2d')
if (!('CropTarget' in window &&
    'getDisplayMedia' in navigator.mediaDevices &&
    'MediaStreamTrackProcessor' in window &&
    'MediaStreamTrackGenerator' in window &&
    'VideoFrame' in window)) {
    canvasCtx.font = '60px sans-serif'
    canvasCtx.fillStyle = 'white'
    canvasCtx.textAlign = 'center'
    fix_size_clear(canvasCtx, 1280, 720)
    canvasCtx.fillText('Not supported by your browser :(', canvas.width / 2, canvas.height/2 - 100)
    canvasCtx.fillText('Try in Chromium desktop!', canvas.width / 2, canvas.height/2 + 100)
    canvas.textContent = 'Not supported by your browser. Try in Chromium desktop!'
}

let skip_changed
video_url.addEventListener('keydown', e => {
    if (e.key == 'Enter' || e.key == 'Tab') {
        skip_changed = true
        get_video(e.currentTarget)
    }
})
video_url.addEventListener('change', e => {
    if (!skip_changed)
        get_video(e.currentTarget)
    skip_changed = false
})
video_url.addEventListener('click', e => {
    skip_changed = false
    if (e.currentTarget.value)
        capture()
})
video_url.addEventListener('focus', e => {
    skip_changed = false
    e.currentTarget.select()  // Broken in Chrome. See: https://issues.chromium.org/issues/40345011#comment45
})

let loop_mode, dotcamera_mode
effect.addEventListener('change', e => {
    if (e.currentTarget.value)
        capture()
    loop_mode = null
    if (e.currentTarget.value == 'loop' || e.currentTarget.value == 'random') {
        loop_mode = e.currentTarget.value
        dotcamera_mode = 0
        loop_effects()
    }
})
document.addEventListener('keydown', e => {
    if (e.altKey && (e.key == 'ArrowUp' || e.key == 'ArrowDown' || e.target != video_url && e.key == 'Enter')) {
        e.preventDefault()
        if (e.key == 'Enter')
            get_video(video_url, false)
        else {
            const effects = [...effect.querySelectorAll('option:not([disabled])')].map(e => e.value)
            effect.value = effects[(effects.length+effects.indexOf(effect.value)+(e.key == 'ArrowUp' ? -1 : 1)) % effects.length]
            effect.dispatchEvent(new Event('change'))
        }
    }
})

function loop_effects() {
    if (!loop_mode || !capture_started)
        return
    // dotcamera_mode += effect.value == 'dotcamera_swissgl'
    const effects = [...effect.querySelectorAll('option:not([disabled]):not([label="meta" i] > *)')].map(e => e.value)
    effect.value = effects[(effects.indexOf(effect.value)+(loop_mode == 'random' ? Math.random()*(effects.length-1) + 1 | 0 : 1)) % effects.length]
    setTimeout(loop_effects, loop_secs * 1000)
}

function get_video(input_elem, reload_youtube) {
    location.hash = load_video(input_elem, orig_video, reload_youtube)[0]
    capture()
}

function show_hide_cursor(elem) {
    elem.classList.remove('show_cursor')
    elem.offsetWidth  // Restart animation, see: https://css-tricks.com/restart-css-animation/
    elem.classList.add('show_cursor')
}
canvas.addEventListener('mousemove', e => show_hide_cursor(e.currentTarget))

// BT.709 limited range YUV to RGB, https://chromium.googlesource.com/libyuv/libyuv/+/e462/source/row_common.cc#1649
function yuv2rgb(Y, U, V, format='RGB') {
    Y = (Y-16) * 1.164
    U -= 128
    V -= 128
    const R = Y + 1.793*V
    const G = Y - .213*U - .533*V
    const B = Y + 2.112*U
    if (format.startsWith('BGR'))
        return [B, G, R]
    return [R, G, B]
}

function cross_product(A, B, C) {
    return (B[0]-A[0])*(C[1]-A[1]) - (B[1]-A[1])*(C[0]-A[0])
}

function is_convex(A, B, C, D) {
    const cross1 = cross_product(A, B, C)
    const cross2 = cross_product(B, C, D)
    const cross3 = cross_product(C, D, A)
    const cross4 = cross_product(D, A, B)

    return (cross1 > 0 && cross2 > 0 && cross3 > 0 && cross4 > 0) ||
           (cross1 < 0 && cross2 < 0 && cross3 < 0 && cross4 < 0)
}

function is_same_side(P1, P2, A, B) {
    const cross1 = cross_product(A, B, P1)
    const cross2 = cross_product(A, B, P2)
    return cross1 * cross2 >= 0
}

function is_inside_convex(P, [A, B, C, D]) {
    return is_same_side(P, C, A, B) &&
           is_same_side(P, D, B, C) &&
           is_same_side(P, A, C, D) &&
           is_same_side(P, B, D, A)
}

function fix_size_clear(canvasCtx, w, h) {
    const canvas = canvasCtx.canvas
    if (canvas.width != w || canvas.height != h) {
        canvas.width = w
        canvas.height = h
    } else
        canvasCtx.clearRect(0, 0, w, h)
}

const colors = ['lime', 'red', 'cyan', 'magenta']

const effect_funcs = {
    pose_landmarks: (videoFrame, poseLandmarker, canvasCtx, drawingUtils) => {
        poseLandmarker.detectForVideo(videoFrame, performance.now(), result => {
            fix_size_clear(canvasCtx, 1920, 1080)
            canvasCtx.save()
            result.landmarks.forEach((landmarks, i) => {
                drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {color: colors[i % colors.length], lineWidth: 5})
                const color = colors[(i+1) % colors.length]
                drawingUtils.drawLandmarks(landmarks, {color: color, fillColor: color, lineWidth: 0, radius: 5})
            })
            canvasCtx.restore()
        })
    },

    chest_xray: (W, H, rgbx, models, videoFrame) => {
        const orig_rgbx = rgbx.slice()
        models.pose.detectForVideo(videoFrame, performance.now(), result =>
            result.landmarks.forEach(landmarks => {
                if (Math.min(landmarks[11].visibility, landmarks[12].visibility) >= .9 && is_convex([landmarks[11].x, landmarks[11].y], [landmarks[12].x, landmarks[12].y], [landmarks[24].x, landmarks[24].y], [landmarks[23].x, landmarks[23].y])) {
                    const ax = landmarks[11].x * W
                    const ay = landmarks[11].y * H
                    const bx = landmarks[12].x * W
                    const by = landmarks[12].y * H
                    const cx = (bx+landmarks[24].x*W) / 2
                    const cy = (by+landmarks[24].y*H) / 2
                    const dx = (ax+landmarks[23].x*W) / 2
                    const dy = (ay+landmarks[23].y*H) / 2
                    const min_x = Math.max(Math.min(ax, bx, cx, dx) | 0, 0)
                    const max_x = Math.min(Math.max(ax, bx, cx, dx), W - 1)
                    const min_y = Math.max(Math.min(ay, by, cy, dy) | 0, 0)
                    const max_y = Math.min(Math.max(ay, by, cy, dy), H - 1)
                    const vertices = [[ax, ay], [bx, by], [cx, cy], [dx, dy]]
                    for (let y = min_y; y <= max_y; y++)
                        for (let x = min_x; x <= max_x; x++)
                            if (is_inside_convex([x, y], vertices)) {
                                const index4 = (x+y*W) * 4
                                rgbx[index4] = 255 - orig_rgbx[index4]
                                rgbx[index4 + 1] = 255 - orig_rgbx[index4 + 1]
                                rgbx[index4 + 2] = 255 - orig_rgbx[index4 + 2]
                            }
                }
            })
        )
    },

    laser_eyes: (W, H, rgbx, models, videoFrame, canvasCtx) => {
        fix_size_clear(canvasCtx, W, H)
        canvasCtx.save()
        models.face.detectForVideo(videoFrame, performance.now()).faceLandmarks.forEach((landmarks, i) => {
            // Landmarks: https://storage.googleapis.com/mediapipe-assets/documentation/mediapipe_face_landmark_fullsize.png
            const eye1 = landmarks[468]
            const eye2 = landmarks[473]
            eye1.x *= W
            eye1.y *= H
            eye2.x *= W
            eye2.y *= H
            const avg = {x: (eye1.x+eye2.x) / 2, y: (eye1.y+eye2.y) / 2}
            const mid = {x: (landmarks[6].x+landmarks[168].x) * W / 2, y: (landmarks[6].y+landmarks[168].y) * H / 2}
            let vec_x = mid.x - avg.x
            let vec_y = mid.y - avg.y
            if (Math.sqrt(vec_x**2 + vec_y**2) > 2) {
                canvasCtx.strokeStyle = 'rgb(255 0 0 / 80%)'
                canvasCtx.shadowColor = 'red'
                canvasCtx.lineCap = 'round'
                const thickness = Math.sqrt((eye2.x-eye1.x)**2 + (eye2.y-eye1.y)**2 + ((eye2.z-eye1.z)*W)**2) / 20
                canvasCtx.lineWidth = thickness
                canvasCtx.shadowBlur = thickness
                canvasCtx.beginPath()
                canvasCtx.moveTo(eye1.x, eye1.y)
                canvasCtx.lineTo(eye1.x + vec_x * W, eye1.y + vec_y * W)
                canvasCtx.moveTo(eye2.x, eye2.y)
                canvasCtx.lineTo(eye2.x + vec_x * W, eye2.y + vec_y * W)
                canvasCtx.stroke()
            } else {
                canvasCtx.fillStyle = 'rgb(255 0 0 / 50%)'
                canvasCtx.fillRect(0, 0, canvasCtx.canvas.width, canvasCtx.canvas.height)
            }
        })
        canvasCtx.restore()
    },

    background_segmentation: (W, H, rgbx, models, videoFrame) => {
        models.segment.segmentForVideo(videoFrame, performance.now(), result =>
            result.categoryMask.getAsFloat32Array().forEach((cat, index) => {
                if (!cat)
                    rgbx[index * 4] = rgbx[index*4 + 1] = rgbx[index*4 + 2] = 0
            })
        )
    },

    modnet_transformers_webgpu: async (W, H, rgbx, models) => {
        const {pixel_values} = await models.modnet_preproc(new RawImage(rgbx, W, H, 4).rgb())
        const {output} = await models.modnet({input: pixel_values})
        const {data} = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(W, H)
        for (let i = 0; i < data.length; i++) {
            const alpha = data[i] / 255
            rgbx[i * 4] *= alpha
            rgbx[i*4 + 1] *= alpha
            rgbx[i*4 + 2] *= alpha
        }
    },

    cartoonization_tfjs_webgpu: (W, H, bgrx, models, videoFrame, canvasCtx) => {
        const bgr = new Float32Array(H * W * 3)
        for (let i = 0; i < bgr.length; i++)
            bgr[i] = bgrx[(i/3|0)*4 + i%3]
        tf.tidy(() => tf.browser.draw(models.cartoon.execute(tf.tensor4d(bgr, [1, H, W, 3])
                        .resizeBilinear([720, 720]).div(127.5).sub(1)).squeeze().add(1).div(2).reverse(-1), canvasCtx.canvas))
    },

    teed_edge_detection_ort_webgpu: async (W, H, bgrx, models) => {
        const bgr = new Uint8Array(H * W * 3)
        for (let i = 0; i < bgr.length; i++)
            bgr[i] = bgrx[(i/3|0)*4 + i%3]
        const {output: {data}} = await models.teed.run({input: new ort.Tensor(bgr, [1, H, W, 3])})
        for (let i = 0; i <data.length; i++)
            bgrx[i * 4] = bgrx[i*4 + 1] = bgrx[i*4 + 2] = data[i]
    },

    dotcamera_swissgl: (W, H, rgbx, models, videoFrame, canvasCtx, gl_engines) => {
        const canvas = canvasCtx.canvas
        const glsl = gl_engines.swissgl
        const gl_canvas = glsl.gl.canvas
        if (canvas.width != W || canvas.height != H || gl_canvas.width != W || gl_canvas.height != H) {
            canvas.width = gl_canvas.width = W
            canvas.height = gl_canvas.height = H
        }
        models.dotcamera.frame(videoFrame, {canvasSize: [W, H], DPR: 1.5, random_mode: loop_mode ? dotcamera_mode : 0})
        canvasCtx.drawImage(gl_canvas, 0, 0)
    },

    ruttetraizer_threejs: (W, H, rgbx, models, videoFrame, canvasCtx, gl_engines) => {
        const canvas = canvasCtx.canvas
        const renderer = gl_engines.threejs
        const gl_canvas = renderer.domElement
        if (canvas.width != W || canvas.height != H || gl_canvas.width != W || gl_canvas.height != H) {
            canvas.width = gl_canvas.width = W
            canvas.height = gl_canvas.height = H
            renderer.setViewport(0, 0, W, H)
        }
        models.ruttetra.frame(W, H, rgbx, {scanStep: 7, depth: 100, random_mode: loop_mode})
        canvasCtx.drawImage(gl_canvas, 0, 0)
    },

    pixel_sorting: (W, H, rgbx, yuv, stride, Voffset, Uoffset) => {
        for (let y = 0; y < H; y++) {
            const yUV = (y >> 1) * stride
            const line = []
            let start
            let end
            for (let x = 0; x < W; x++) {
                const xUV = x >> 1
                const Y = yuv[x + y*W]
                const U = yuv[Voffset + xUV + yUV]
                const V = yuv[Uoffset + xUV + yUV]
                line.push({Y, U, V})
                if (Y > 16 || U != 128 || V != 128) {
                    start ??= x
                    end = x
                }
            }
            const part = line.splice(start, end - start + 1)
            part.sort((a, b) => (a.Y - b.Y))
            line.splice(start, 0, ...part)
            for (let x = 0; x < W; x++) {
                const {Y, U, V} = line[x]
                const index4 = (x+y*W) * 4
                ;[rgbx[index4], rgbx[index4 + 1], rgbx[index4 + 2]] = yuv2rgb(Y, U, V)
            }
        }
    },

    bayer_dithering: (W, H, rgbx, yuv) => {
        const bayer_r = 96
        const threshold = 128
        const matrix = [[ -0.5   ,  0     , -0.375 ,  0.125  ],
                        [  0.25  , -0.25  ,  0.375 , -0.125  ],
                        [ -0.3125,  0.1875, -0.4375,  0.0625 ],
                        [  0.4375, -0.0625,  0.3125, -0.1875 ]]
        const bayer_n = matrix.length
        const downscale = 3
        for (let y = 0; y < H; y += downscale)
            for (let x = 0; x < W; x += downscale) {
                const val = (yuv[x + y*W]-16)*1.164 + bayer_r*matrix[y / downscale % bayer_n][x / downscale % bayer_n] >= threshold ? [237, 230, 205] : [33, 38, 63]
                for (let j = 0; j < downscale; j++)
                    for (let i = 0; i < downscale; i++) {
                        const index4 = ((x+i)+(y+j)*W) * 4
                        ;[rgbx[index4], rgbx[index4 + 1], rgbx[index4 + 2]] = val
            }
        }
    },
}

let frames = 0
if (debug_fps)
    setInterval(() => {if (frames) console.debug(`(${out_video.videoWidth}x${out_video.videoHeight}) fps ${frames == 1 ? '<' : ''}=`, frames); frames = 0}, 1000)

let capture_started
async function capture() {
    if (capture_started || orig_video.src == 'about:blank')
        return
    capture_started = true
    let stream
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({
            preferCurrentTab: true,
            surfaceSwitching: 'exclude',
            video: {
                aspectRatio: 16 / 9,
                cursor: 'never',  // Not implemented yet. See: https://issues.chromium.org/issues/40649204
                width: {max: max_res_width || undefined},
            },
        })
    } catch (e) {
        console.warn(e)
        capture_started = false
        return
    }
    const [track] = stream.getVideoTracks()
    track.addEventListener('ended', () => capture_started = false)

    if ('RestrictionTarget' in window) {
        // For fullscreen zoom of output (with right-click) enable
        // chrome://flags/#element-capture in Google Chrome, or
        // chrome://flags/#enable-experimental-web-platform-features in Chromium
        // See: https://developer.chrome.com/docs/web-platform/element-capture
        // Note that pinch zoom pauses the stream: https://issues.chromium.org/issues/337337168
        const restrictionTarget = await RestrictionTarget.fromElement(orig_video)
        await track.restrictTo(restrictionTarget)
        videos.oncontextmenu = e => toggle_fullscreen(e)
    } else {
        const cropTarget = await CropTarget.fromElement(orig_video)
        await track.cropTo(cropTarget)
    }

    const vision = await FilesetResolver.forVisionTasks(mediapipe_wasm_url)

    // https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js
    const pose_model_size = 'lite'  // 'full', 'heavy'
    const poseLandmarker = await PoseLandmarker.createFromOptions(
        vision,
        {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${pose_model_size}/float16/latest/pose_landmarker_${pose_model_size}.task`,
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numPoses: 3,
            minPoseDetectionConfidence: .5,
            minPosePresenceConfidence: .5,
            minTrackingConfidence: .5,
        }
    )

    // https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js
    // Note: This is currently only for short range faces. See: https://github.com/google-ai-edge/mediapipe/issues/4869
    const faceLandmarker = await FaceLandmarker.createFromOptions(
        vision, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numFaces: 3,
            minFaceDetectionConfidence: .5,
            minFacePresenceConfidence: .5,
            minTrackingConfidence: .5,
        }
    )

    // https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter/web_js
    const imageSegmenter = await ImageSegmenter.createFromOptions(
        vision, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/latest/deeplab_v3.tflite',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            outputCategoryMask: true,
            outputConfidenceMasks: false,
        }
    )

    let need_select
    function disable_option(value) {
        const option = effect.querySelector(`option[value=${value}]`)
        option.disabled = true
        need_select ||= option.selected
    }

    let modnet, modnet_preproc
    try {
        // https://github.com/ZHKKKe/MODNet
        // https://huggingface.co/Xenova/modnet
        const modnet_path = 'Xenova/modnet'
        modnet = await AutoModel.from_pretrained(modnet_path, {quantized: false, device: 'webgpu', dtype: 'fp32'})
        modnet_preproc = await AutoProcessor.from_pretrained(modnet_path)
    } catch (e) {
        console.warn(e)
        disable_option('modnet_transformers_webgpu')
    }

    let queue, cartoon
    try {
        await tf.setBackend('webgpu')
        queue = tf.backend().queue

        // https://github.com/SystemErrorWang/White-box-Cartoonization
        // https://github.com/vladmandic/anime
        cartoon = await tf.loadGraphModel('models/cartoon/whitebox.json')
    } catch (e) {
        console.warn(e)
        disable_option('cartoonization_tfjs_webgpu')
    }

    let teed
    try {
        // https://github.com/xavysp/TEED
        teed = await ort.InferenceSession.create('models/teed/teed16.onnx', {executionProviders: ['webgpu']})
    } catch (e) {
        console.warn(e)
        disable_option('teed_edge_detection_ort_webgpu')
    }

    // https://github.com/google/swissgl/blob/main/demo/DotCamera.js
    const gl = new OffscreenCanvas(0, 0).getContext('webgl2', {alpha: false, antialias: true})
    const glsl = SwissGL(gl)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    const dotcamera = new DotCamera(glsl, {dayMode: false, rgbMode: false})

    // https://www.airtightinteractive.com/2011/06/rutt-etra-izer/
    let renderer, ruttetraizer
    try {
        renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance', sortObjects: false})
        ruttetraizer = new RuttEtraIzer(THREE, renderer, canvas)
    } catch (e) {
        console.warn(e)
        disable_option('ruttetraizer_threejs')
    }

    const gl_engines = {swissgl: glsl, threejs: renderer}

    if (need_select)
        effect.value = effect.querySelector('option:not([disabled])').value

    const models = {pose: poseLandmarker,
                    face: faceLandmarker,
                    segment: imageSegmenter,
                    modnet: modnet,
                    modnet_preproc: modnet_preproc,
                    cartoon: cartoon,
                    teed: teed,
                    dotcamera: dotcamera,
                    ruttetra: ruttetraizer,
                   }
    const drawingUtils = new DrawingUtils(canvasCtx)

    const trackProcessor = new MediaStreamTrackProcessor({track: track})
    const trackGenerator = new MediaStreamTrackGenerator({kind: 'video'})
    const transformer = new TransformStream({
        async transform(videoFrame, controller) {
            if (effect.value.includes('pose_landmarks'))
                effect_funcs.pose_landmarks(videoFrame, poseLandmarker, canvasCtx, drawingUtils)
            else if (!effect.value.includes('laser') && !effect.value.includes('swissgl') && !effect.value.includes('threejs') && (canvas.width || canvas.height))
                canvas.width = canvas.height = 0
            const W = videoFrame.codedWidth
            const H = videoFrame.codedHeight
            const rgbx = new Uint8ClampedArray(H * W * 4)
            let format = 'RGBX'

            if (effect.value != 'pose_landmarks') {
                let yuv_data = []
                if (effect.value.includes('sorting') || effect.value.includes('dithering')) {
                    const yuv = new Uint8ClampedArray(H * W * 1.5)
                    const layout = await videoFrame.copyTo(yuv)
                    const {stride, offset: Voffset} = layout[1]
                    const {offset: Uoffset} = layout[2]
                    yuv_data = [yuv, stride, Voffset, Uoffset]
                } else if (!effect.value.includes('swissgl')) {
                    if (effect.value.includes('cartoon') || effect.value.includes('teed'))
                        format = 'BGRX'
                    const layout = await videoFrame.copyTo(rgbx, {format: format})
                    if (layout.length == 3)  // Fallback if copyTo(..., format) is not supported (Chrome < 127)
                    {
                        const yuv = rgbx.slice(0, H * W * 1.5)
                        const {stride, offset: Voffset} = layout[1]
                        const {offset: Uoffset} = layout[2]
                        for (let y = 0; y < H; y++) {
                            const yUV = (y >> 1) * stride
                            for (let x = 0; x < W; x++) {
                                const xUV = x >> 1
                                const Y = yuv[x + y*W]
                                const U = yuv[Voffset + xUV + yUV]
                                const V = yuv[Uoffset + xUV + yUV]
                                const index4 = (x+y*W) * 4
                                ;[rgbx[index4], rgbx[index4 + 1], rgbx[index4 + 2]] = yuv2rgb(Y, U, V, format)
                                rgbx[index4 + 3] = 255  // Circumvent Chrome issue where alpha is not being ignored: https://issues.chromium.org/issues/360354555
                            }
                        }
                    }
                }
                if (effect.value in effect_funcs && !effect.value.includes('recode')) {
                    await effect_funcs[effect.value](W, H, rgbx, ...yuv_data, models, videoFrame, canvasCtx, gl_engines)
                    if (effect.value.includes('tfjs_webgpu'))
                        await queue.onSubmittedWorkDone()  // This reduces lag. See also: https://github.com/tensorflow/tfjs/issues/6683#issuecomment-1219505611, https://github.com/gpuweb/gpuweb/issues/3762#issuecomment-1400514317
                }
            }
            const init = {
                codedHeight: H,
                codedWidth: W,
                format: format,
                alpha: 'discard',
                timestamp: videoFrame.timestamp,
            }
            videoFrame.close()
            if (rgbx[3] == 0)  // Circumvent Chrome issue where alpha is not being ignored: https://issues.chromium.org/issues/360354555
                for (let i = 3; i < rgbx.length; i += 4)
                    rgbx[i] = 255
            controller.enqueue(new VideoFrame(rgbx, init))
            frames++
        }
    })
    trackProcessor.readable.pipeThrough(transformer).pipeTo(trackGenerator.writable)
    out_video.srcObject = new MediaStream([trackGenerator])
    loop_effects()
}