import {
    PoseLandmarker,
    FaceLandmarker,
    ImageSegmenter,
    FilesetResolver,
    DrawingUtils
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'

import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js'
import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgpu@4.20.0/dist/tf-backend-webgpu.min.js'
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/esm/ort.webgpu.min.js'
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/'
import SwissGL from 'https://cdn.jsdelivr.net/npm/@pluvial/swissgl/dist/swissgl.min.js'
import DotCamera from './models/DotCamera.js'

let loop_secs = 10

function getGPUInfo() {
  const gl = document.createElement('canvas').getContext('webgl')
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'GPU unknown'
}
console.log(getGPUInfo())

if (typeof CropTarget == 'undefined' ||
    typeof navigator.mediaDevices.getDisplayMedia == 'undefined' ||
    typeof MediaStreamTrackProcessor == 'undefined' ||
    typeof MediaStreamTrackGenerator == 'undefined' ||
    typeof VideoFrame == 'undefined')
    out_video.outerHTML = '<div><p>Not supported by your browser :(</p><p>Try in Chromium desktop!</p></div>'

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
video_url.addEventListener('focus', e => {
    skip_changed = false
    e.currentTarget.select()  // Broken in Chrome. See: https://issues.chromium.org/issues/40345011#comment45
    if (e.currentTarget.value)
        capture()
})

let loop_mode
effect.addEventListener('change', e => {
    loop_mode = null
    if (effect.value == 'loop' || effect.value == 'random') {
        loop_mode = effect.value
        loop_effects()
    }
})
document.addEventListener('keydown', e => {
    if (e.altKey && (e.key == 'ArrowUp' || e.key == 'ArrowDown')) {
        e.preventDefault()
        const effects = [...effect.querySelectorAll('option:not([disabled])')].map(e => e.value)
        effect.value = effects[(effects.length+effects.indexOf(effect.value)+(e.key == 'ArrowUp' ? -1 : 1)) % effects.length]
    }
})

function loop_effects() {
    if (!loop_mode)
        return
    const effects = [...effect.querySelectorAll('option:not([disabled]):not([label="meta" i] > *)')].map(e => e.value)
    effect.value = effects[(effects.indexOf(effect.value)+(loop_mode == 'random' ? Math.random()*(effects.length-1) + 1 | 0: 1)) % effects.length]
    setTimeout(loop_effects, loop_secs * 1000)
}

function get_video(input_elem) {
    let host = ''
    let vid_id = input_elem.value
    let url = 'about:blank'
    let params = vid_id.match(/(#|&|\?[^v][^=]*=).+|$/)[0]
    if (params)
        vid_id = vid_id.split(params)[0]
    if (vid_id.includes('/') && !vid_id.includes('//'))
        vid_id = 'https://' + vid_id
    const fallback = vid_id
    try {
        const input_url = new URL(vid_id)
        host = input_url.hostname
        vid_id = input_url.searchParams.get('v') || input_url.pathname.split('/').at(-1)
    } catch {}
    if (host.includes('vimeo') || vid_id.match(/^\d+$/))  // Vimeo
        url = `https://player.vimeo.com/video/${vid_id}?autoplay=1&byline=0&dnt=1&loop=1&&muted=1&portrait=0&quality=1080p&title=0${params}`
    else if (host && !host.includes('youtu')) {  // Any other URL
        url = fallback + params
        vid_id = fallback.split('//').at(-1)
    } else if (vid_id) {  // YouTube
        params = params.replace(/[&?]t=(\d+).*/, '&start=$1')
        url = `https://www.youtube-nocookie.com/embed/${vid_id}?autoplay=1&loop=1&playlist=${vid_id}&playsinline=1&rel=0${params}&mute=1`
        orig_video.onload = () => {orig_video.onload = ''; orig_video.src = url}  // Reload to overcome "This video is unavailable" error on first load of video with playlist parameter. See: https://issuetracker.google.com/issues/249707272
    }
    location.hash = vid_id + params
    orig_video.src = url
    capture()
}

function yuv2rgb(Y, U, V) {  // BT.709 https://github.com/pps83/libyuv/blob/master/source/row_common.cc#L1226
    Y = (Y-16) * 1.164
    U -= 128
    V -= 128
    return [Y + 1.793*V, Y - .213*U - .533*V, Y + 2.112*U]
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
    'pose_landmarks': (videoFrame, poseLandmarker, canvasCtx, drawingUtils) => {
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

    'chest_xray': (W, H, rgbx, models, videoFrame) => {
        const orig_rgbx = rgbx.slice()
        models['pose'].detectForVideo(videoFrame, performance.now(), result =>
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
                                const offset4 = (x+y*W) * 4
                                rgbx[offset4] = 255 - orig_rgbx[offset4]
                                rgbx[offset4 + 1] = 255 - orig_rgbx[offset4 + 1]
                                rgbx[offset4 + 2] = 255 - orig_rgbx[offset4 + 2]
                            }
                }
            })
        )
    },

    'laser_eyes': (W, H, rgbx, models, videoFrame, canvasCtx) => {
        fix_size_clear(canvasCtx, W, H)
        canvasCtx.save()
        models['face'].detectForVideo(videoFrame, performance.now()).faceLandmarks.forEach((landmarks, i) => {
            // Landmarks: https://storage.googleapis.com/mediapipe-assets/documentation/mediapipe_face_landmark_fullsize.png
            const eye1 = landmarks[468]
            const eye2 = landmarks[473]
            const avg = {x: (eye1.x+eye2.x) / 2, y: (eye1.y+eye2.y) / 2}
            const mid = {x: (landmarks[6].x+landmarks[168].x) / 2, y: (landmarks[6].y+landmarks[168].y) / 2}
            let vec_x = (mid.x-avg.x) * W
            let vec_y = (mid.y-avg.y) * H
            const norm = Math.sqrt(vec_x**2 + vec_y**2)
            if (norm > 1) {
                vec_x /= norm
                vec_y /= norm
                canvasCtx.strokeStyle = 'rgb(255 0 0 / 80%)'
                canvasCtx.shadowColor = 'red'
                canvasCtx.lineCap = 'round'
                const thickness = Math.sqrt((eye2.x-eye1.x)**2 + ((eye2.y-eye1.y)*H/W)**2 + (eye2.z-eye1.z)**2) * 100
                canvasCtx.lineWidth = thickness
                canvasCtx.shadowBlur = thickness
                canvasCtx.beginPath()
                canvasCtx.moveTo(eye1.x * W, eye1.y * H)
                canvasCtx.lineTo((eye1.x+vec_x) * W, (eye1.y+vec_y) * H)
                canvasCtx.moveTo(eye2.x * W, eye2.y * H)
                canvasCtx.lineTo((eye2.x+vec_x) * W, (eye2.y+vec_y) * H)
                canvasCtx.stroke()
            } else {
                canvasCtx.fillStyle = 'rgb(255 0 0 / 50%)'
                canvasCtx.fillRect(0, 0, canvasCtx.canvas.width, canvasCtx.canvas.height)
            }
        })
        canvasCtx.restore()
    },

    'background_removal': (W, H, rgbx, models, videoFrame) => {
        models['segment'].segmentForVideo(videoFrame, performance.now(), result =>
            result.confidenceMasks[0].getAsFloat32Array().forEach((conf, offset) => {
                if (conf > .5)
                    rgbx[offset * 4] = rgbx[offset*4 + 1] = rgbx[offset*4 + 2] = 0
            })
        )
    },

    'cartoonization_tfjs_webgpu': (W, H, rgbx, models, videoFrame, canvasCtx) => {
        const rgb = new Float32Array(H * W * 3)
        for (let i = 0; i < rgb.length; i++)
            rgb[i] = rgbx[(i/3|0)*4 + i%3]
        tf.tidy(() => tf.browser.draw(models['cartoon'].execute(tf.tensor4d(rgb, [1, H, W, 3])
                        .resizeBilinear([720, 720]).div(127.5).sub(1)).squeeze().add(1).div(2), canvasCtx.canvas))
    },

    'teed_edge_detection_ort_webgpu': async (W, H, rgbx, models) => {
        const rgb = new Uint8Array(H * W * 3)
        for (let i = 0; i < rgb.length; i++)
            rgb[i] = rgbx[(i/3|0)*4 + i%3]
        const result = await models['teed'].run({input: new ort.Tensor(rgb, [1, H, W, 3])})
        for (let i = 0; i < result.output.data.length; i++)
            rgbx[i * 4] = rgbx[i*4 + 1] = rgbx[i*4 + 2] = result.output.data[i]
    },

    'dot_camera_swissgl': (W, H, rgbx, models, videoFrame, canvasCtx, glsl) => {
        const canvas = canvasCtx.canvas
        const gl_canvas = glsl.gl.canvas
        if (canvas.width != W || canvas.height != H || gl_canvas.width != W || gl_canvas.height != H) {
            canvas.width = gl_canvas.width = W
            canvas.height = gl_canvas.height = H
        }
        models['dotcamera'].frame(glsl, videoFrame, {canvasSize: [canvas.clientWidth, canvas.clientHeight], DPR: devicePixelRatio})
        canvasCtx.drawImage(gl_canvas, 0, 0)
    },

    'pixel_sorting': (W, H, stride, Voffset, Uoffset, yuv, rgbx) => {
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
                const offset4 = (x+y*W) * 4
                ;[rgbx[offset4], rgbx[offset4 + 1], rgbx[offset4 + 2]] = yuv2rgb(Y, U, V)
            }
        }
    },

    'bayer_dithering': (W, H, stride, Voffset, Uoffset, yuv, rgbx) => {
        const bayer_r = 96
        const threshold = 144
        const matrix = [[ -0.5   ,  0     , -0.375 ,  0.125  ],
                        [  0.25  , -0.25  ,  0.375 , -0.125  ],
                        [ -0.3125,  0.1875, -0.4375,  0.0625 ],
                        [  0.4375, -0.0625,  0.3125, -0.1875 ]]
        const bayer_n = matrix.length
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                const offset4 = (x+y*W) * 4
                ;[rgbx[offset4], rgbx[offset4 + 1], rgbx[offset4 + 2]] = yuv[x + y*W] + bayer_r*matrix[y % bayer_n][x % bayer_n] >= threshold ? [237, 230, 205] : [33, 38, 63]
            }
    },
}

let capture_started

async function capture() {
    if (capture_started)
        return
    capture_started = true
    let stream
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({
            preferCurrentTab: true
        })
    } catch (e) {
        console.warn(e)
        capture_started = false
        return
    }
    const [track] = stream.getVideoTracks()
    track.addEventListener('ended', () => capture_started = false)
    if (typeof RestrictionTarget != 'undefined') {
        // For fullscreen zoom of output (with right-click) enable
        // chrome://flags/#element-capture in Google Chrome, or
        // chrome://flags/#enable-experimental-web-platform-features in Chromium
        // See: https://developer.chrome.com/docs/web-platform/element-capture
        // Note that pinch zoom pauses the stream: https://issues.chromium.org/issues/337337168
        const restrictionTarget = await RestrictionTarget.fromElement(orig_video)
        await track.restrictTo(restrictionTarget)
        out_container.oncontextmenu = e => toggle_fullscreen(e)
        out_container.title = 'Right-click to enter/exit fullscreen'
    } else {
        const cropTarget = await CropTarget.fromElement(orig_video)
        await track.cropTo(cropTarget)
    }

    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm')

    // https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js
    const poseLandmarker = await PoseLandmarker.createFromOptions(
        vision,
        {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
                // modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
                // modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numPoses: 3,
            minPoseDetectionConfidence: .5,
            minPosePresenceConfidence: .5,
            minTrackingConfidence: .5,
        })

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
        })

    // https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter/web_js
    const imageSegmenter = await ImageSegmenter.createFromOptions(
        vision, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/latest/deeplab_v3.tflite',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
        })

    let webgpu = true

    let queue, cartoon
    try {
        await tf.setBackend('webgpu')
        queue = tf.backend().queue

        // https://github.com/SystemErrorWang/White-box-Cartoonization
        // https://github.com/vladmandic/anime
        cartoon = await tf.loadGraphModel('models/cartoon/whitebox.json')
    } catch (e) {
        console.warn(e)
        webgpu = !e.message.includes('webgpu')
    }

    let teed
    try {
        // https://github.com/xavysp/TEED
        teed = await ort.InferenceSession.create('models/teed/teed16.onnx', {executionProviders: ['webgpu']})
    } catch (e) {
        console.warn(e)
        webgpu = !e.message.includes('webgpu')
    }

    if (!webgpu)
        effect.querySelectorAll('option[value*=webgpu]').forEach(e => {
            e.disabled = true
            if (e.selected)
                effect.value = effect.querySelector('option:not([value*=webgpu])').value
        })

    // https://github.com/google/swissgl/blob/main/demo/DotCamera.js
    const gl = new OffscreenCanvas(0, 0).getContext('webgl2', {alpha: false, antialias: true})
    const glsl = SwissGL(gl)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    const dotcamera = new DotCamera(glsl, {dayMode: false, rgbMode: false})

    const models = {'pose': poseLandmarker, 'face': faceLandmarker, 'segment': imageSegmenter, 'cartoon': cartoon, 'teed': teed, 'dotcamera': dotcamera}
    const canvasCtx = canvas.getContext('2d')
    const drawingUtils = new DrawingUtils(canvasCtx)

    let frames = 0
    setInterval(() => {console.debug('fps =', frames); frames = 0}, 1000)

    const trackProcessor = new MediaStreamTrackProcessor({track: track})
    const trackGenerator = new MediaStreamTrackGenerator({kind: 'video'})
    const transformer = new TransformStream({
        async transform(videoFrame, controller) {
            if (effect.value.includes('landmarks'))
                effect_funcs['pose_landmarks'](videoFrame, poseLandmarker, canvasCtx, drawingUtils)
            else if (!effect.value.includes('laser') && !effect.value.includes('swissgl') && (canvas.width != 0 || canvas.height != 0))
                canvas.width = canvas.height = 0
            const W = videoFrame.codedWidth
            const H = videoFrame.codedHeight
            const rgbx = new Uint8ClampedArray(H * W * 4)

            if (effect.value != 'pose_landmarks') {
                let yuv_data = []
                if (effect.value.includes('sorting') || effect.value.includes('dithering')) {
                    const yuv = new Uint8ClampedArray(H * W * 1.5)
                    const layout = await videoFrame.copyTo(yuv)
                    const {stride, offset: Voffset} = layout[1]
                    const {offset: Uoffset} = layout[2]
                    yuv_data = [stride, Voffset, Uoffset, yuv]
                } else if (!effect.value.includes('swissgl')) {
                    const layout = await videoFrame.copyTo(rgbx, {format: 'RGBX'})
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
                                const offset4 = (x+y*W) * 4
                                ;[rgbx[offset4], rgbx[offset4 + 1], rgbx[offset4 + 2]] = yuv2rgb(Y, U, V)
                            }
                        }
                    }
                }
                if (effect.value in effect_funcs && !effect.value.includes('recode')) {
                    await effect_funcs[effect.value](W, H, ...yuv_data, rgbx, models, videoFrame, canvasCtx, glsl)
                    if (effect.value.includes('tfjs_webgpu'))
                        await queue.onSubmittedWorkDone()  // This reduces lag. See also: https://github.com/tensorflow/tfjs/issues/6683#issuecomment-1219505611, https://github.com/gpuweb/gpuweb/issues/3762#issuecomment-1400514317
                }
            }
            const init = {
                codedHeight: H,
                codedWidth: W,
                format: 'RGBX',
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
}


// FULLSCREEN

let wake_lock

function request_wake_lock() {
    navigator.wakeLock?.request('screen').then(lock => wake_lock = lock).catch(e => console.warn(e.message))
}

function visibility_change_handler() {
    if (wake_lock && document.visibilityState == 'visible')
        request_wake_lock()
}

function toggle_fullscreen(event_or_elem, landscape=true, target_screen, elem) {
    if (event_or_elem.preventDefault)
        event_or_elem.preventDefault()
    elem ??= event_or_elem?.currentTarget || event_or_elem
    const was_not_fullscreen_before = !document.fullscreenElement
    if (was_not_fullscreen_before) {
        if (!elem.dataset.has_fullscreen_handler) {
            elem.dataset.has_fullscreen_handler = true
            elem.addEventListener('fullscreenchange', () => {
                if (elem.classList.toggle('fullscreen')) {
                    if (landscape)
                        screen.orientation.lock('landscape').catch(e => console.warn(e.message))  // Works only in Chrome Android. See: https://bugzilla.mozilla.org/show_bug.cgi?id=1744125
                    request_wake_lock()
                    document.addEventListener('visibilitychange', visibility_change_handler)
                } else
                    wake_lock?.release().then(() => wake_lock = null)
            })
        }
        elem.requestFullscreen({navigationUI: 'hide', screen: target_screen}).catch(e => console.warn(e.message))
    } else
        document.exitFullscreen()
    return was_not_fullscreen_before
}