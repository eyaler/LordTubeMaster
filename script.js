import {
    PoseLandmarker,
    ImageSegmenter,
    FilesetResolver,
    DrawingUtils
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'

import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js'
import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgpu@4.20.0/dist/tf-backend-webgpu.min.js'

function getGPUInfo() {
  const gl = document.createElement('canvas').getContext('webgl')
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  return ext ? {
    vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
    renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
  } : {
    vendor: 'unknown',
    renderer: 'unknown',
  }
}
console.log(getGPUInfo())

if (typeof CropTarget == 'undefined' ||
    typeof navigator.mediaDevices.getDisplayMedia == 'undefined' ||
    typeof MediaStreamTrackProcessor == 'undefined' ||
    typeof MediaStreamTrackGenerator == 'undefined' ||
    typeof VideoFrame == 'undefined')
    out_video.outerHTML = '<div><p>Not supported by your browser :(</p><p>Try in Chromium desktop!</p><div>'

video_url.addEventListener('change', e => get_video(e.currentTarget))
video_url.addEventListener('keydown', e => {if (e.key == 'Enter' || e.key == 'Tab') get_video(e.currentTarget)})
video_url.addEventListener('focus', e => {if (e.currentTarget.value) capture_select(e.currentTarget)})

function get_video(input_elem) {
    let host = ''
    let vid_id = input_elem.value
    let url = 'about:blank'
    if (vid_id.includes('/') && !vid_id.includes('//'))
        vid_id = 'https://' + vid_id
    let params = vid_id.match(/(#|&|\?[^v][^=]*=).+|$/)[0]
    if (params)
        vid_id = vid_id.split(params)[0]
    try {
        const input_url = new URL(vid_id)
        host = input_url.hostname
        vid_id = input_url.searchParams.get('v') || input_url.pathname.split('/').at(-1)
    } catch {}
    if (host.includes('vimeo') || vid_id.match(/^\d+$/))
        url = `https://player.vimeo.com/video/${vid_id}?autoplay=1&byline=0&dnt=1&loop=1&&muted=1&portrait=0&quality=1080p&title=0${params}`
    else if (vid_id) {
        params = params.replace(/[&?]t=(\d+).*/, '&start=$1')
        url = `https://www.youtube-nocookie.com/embed/${vid_id}?autoplay=1&loop=1&playlist=${vid_id}&playsinline=1&rel=0${params}&mute=1`
    }
    location.hash = vid_id + params
    orig_video.src = url
    capture_select(input_elem)
}

function yuv2rgb(Y, U, V) {  // https://github.com/pps83/libyuv/blob/master/source/row_common.cc#L1226
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

const colors = ['lime', 'red', 'cyan', 'magenta']

let lastVideoTime = -1

const effect_funcs = {
    'pose_landmarks': (videoFrame, poseLandmarker, canvasCtx, drawingUtils) => {
        const startTimeMs = performance.now()
        if (lastVideoTime != videoFrame.timestamp) {
            lastVideoTime = videoFrame.timestamp
            poseLandmarker.detectForVideo(videoFrame, startTimeMs, result => {
                canvasCtx.save()
                canvas.width = 1920
                canvas.height = 1080
                result.landmarks.forEach((landmarks, i) => {
                    drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: colors[i % colors.length], lineWidth: 5 })
                    const color = colors[(i+1) % colors.length]
                    drawingUtils.drawLandmarks(landmarks, { color: color, fillColor: color, lineWidth: 0, radius: 5 })
                })
                canvasCtx.restore()
            })
        }
    },

    'chest_xray': (W, H, stride, Voffset, Uoffset, yuv, rgba, models, videoFrame) => {
        for (let y = 0; y < H; y++) {
            const yUV = (y >> 1) * stride
            for (let x = 0; x < W; x++) {
                const xUV = x >> 1
                const Y = yuv[x + y*W]
                const U = yuv[Voffset + xUV + yUV]
                const V = yuv[Uoffset + xUV + yUV]
                const offset4 = (x+y*W) * 4
                ;[rgba[offset4], rgba[offset4 + 1], rgba[offset4 + 2]] = yuv2rgb(Y, U, V)
                rgba[offset4 + 3] = 255
            }
        }
        const orig_rgba = new Uint8ClampedArray(rgba)
        const startTimeMs = performance.now()
        if (lastVideoTime != videoFrame.timestamp) {
            lastVideoTime = videoFrame.timestamp
            models['pose'].detectForVideo(videoFrame, startTimeMs, result =>
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
                        const min_x = Math.min(ax, bx, cx, dx)
                        const max_x = Math.max(ax, bx, cx, dx)
                        const min_y = Math.min(ay, by, cy, dy)
                        const max_y = Math.max(ay, by, cy, dy)
                        const vertices = [[ax, ay], [bx, by], [cx, cy], [dx, dy]]
                        for (let y = min_y | 0; y <= max_y; y++)
                            for (let x = min_x | 0; x <= max_x; x++)
                                if (is_inside_convex([x, y], vertices)) {
                                    const offset4 = (x+y*W) * 4
                                    rgba[offset4] = 255 - orig_rgba[offset4]
                                    rgba[offset4 + 1] = 255 - orig_rgba[offset4 + 1]
                                    rgba[offset4 + 2] = 255 - orig_rgba[offset4 + 2]
                                }
                    }
                })
            )
        }
    },

    'background_removal': (W, H, stride, Voffset, Uoffset, yuv, rgba, models, videoFrame) => {
        const startTimeMs = performance.now()
        if (lastVideoTime != videoFrame.timestamp) {
            lastVideoTime = videoFrame.timestamp
            models['segment'].segmentForVideo(videoFrame, startTimeMs, result =>
                result.confidenceMasks[0].getAsFloat32Array().forEach((conf, offset) => {
                    if (conf < .5) {
                        const y = offset / W | 0
                        const x = offset % W
                        const yUV = (y >> 1) * stride
                        const xUV = x >> 1
                        const Y = yuv[x + y*W]
                        const U = yuv[Voffset + xUV + yUV]
                        const V = yuv[Uoffset + xUV + yUV]
                        const offset4 = offset * 4
                        ;[rgba[offset4], rgba[offset4 + 1], rgba[offset4 + 2]] = yuv2rgb(Y, U, V)
                        rgba[offset4 + 3] = 255
                    }
                })
            )
        }
    },

    'cartoonization_webgpu': (W, H, stride, Voffset, Uoffset, yuv, rgba, models, videoFrame) => {
        let rgb = new Float32Array(W * H * 3)
        for (let y = 0; y < H; y++) {
            const yUV = (y >> 1) * stride
            for (let x = 0; x < W; x++) {
                const xUV = x >> 1
                const Y = yuv[x + y*W]
                const U = yuv[Voffset + xUV + yUV]
                const V = yuv[Uoffset + xUV + yUV]
                const offset3 = (x+y*W) * 3
                const [R, G, B] = yuv2rgb(Y, U, V)
                rgb[offset3] = R
                rgb[offset3 + 1] = G
                rgb[offset3 + 2] = B
            }
        }

        tf.tidy(() => {
            rgb = models['cartoon'].execute(tf.tensor4d(rgb, [1, H, W, 3])
                                  .resizeBilinear([720, 720])
                                  .div(127.5)
                                  .sub(1))
                       .squeeze()
                       .add(1)
                       .div(2)
            tf.browser.draw(rgb, canvas)
        })
    },

    'pixel_sorting': (W, H, stride, Voffset, Uoffset, yuv, rgba) => {
        for (let y = 0; y < H; y++) {
            const yUV = (y >> 1) * stride
            const line = []
            for (let x = 0; x < W; x++) {
                const xUV = x >> 1
                const Y = yuv[x + y*W]
                const U = yuv[Voffset + xUV + yUV]
                const V = yuv[Uoffset + xUV + yUV]
                line.push({Y, U, V})
            }
            line.sort((a, b) => (a.Y - b.Y))
            for (let x = 0; x < W; x++) {
                const {Y, U, V} = line[x]
                const offset4 = (x+y*W) * 4
                ;[rgba[offset4], rgba[offset4 + 1], rgba[offset4 + 2]] = yuv2rgb(Y, U, V)
                rgba[offset4 + 3] = 255
            }
        }
    },

    'bayer_dithering': (W, H, stride, Voffset, Uoffset, yuv, rgba) => {
        const bayer_r = 96
        const threshold = 144
        const matrix = [[ -0.5   ,  0     , -0.375 ,  0.125  ],
                        [  0.25  , -0.25  ,  0.375 , -0.125  ],
                        [ -0.3125,  0.1875, -0.4375,  0.0625 ],
                        [  0.4375, -0.0625,  0.3125, -0.1875 ]]
        const bayer_n = matrix.length
        for (let y = 0; y < H; y++) {
            const yUV = (y >> 1) * stride
            for (let x = 0; x < W; x++) {
                const xUV = x >> 1
                const Y = yuv[x + y*W]
                const U = yuv[Voffset + xUV + yUV]
                const V = yuv[Uoffset + xUV + yUV]
                let R, G, B
                if (Y + bayer_r*matrix[y % bayer_n][x % bayer_n] >= threshold) {
                    R = 237
                    G = 230
                    B = 205
                } else {
                    R = 33
                    G = 38
                    B = 63
                }
                const offset4 = (x+y*W) * 4
                rgba[offset4] = R
                rgba[offset4 + 1] = G
                rgba[offset4 + 2] = B
                rgba[offset4 + 3] = 255
            }
        }
    },

    'recode_original': (W, H, stride, Voffset, Uoffset, yuv, rgba) => {
        for (let y = 0; y < H; y++) {
            const yUV = (y >> 1) * stride
            for (let x = 0; x < W; x++) {
                const xUV = x >> 1
                const Y = yuv[x + y*W]
                const U = yuv[Voffset + xUV + yUV]
                const V = yuv[Uoffset + xUV + yUV]
                const offset4 = (x+y*W) * 4
                ;[rgba[offset4], rgba[offset4 + 1], rgba[offset4 + 2]] = yuv2rgb(Y, U, V)
                rgba[offset4 + 3] = 255
            }
        }
    },
}

effect_funcs['recode_landmarks'] = effect_funcs['recode_original']

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
        // In Google Chrome, enable chrome://flags/#element-capture - this will enable fullscreen zoom of output
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
            numPoses: 2,
            minPoseDetectionConfidence: .5,
            minPosePresenceConfidence: .5,
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

    try {
        await tf.setBackend('webgpu')
    } catch (e) {
        console.warn(e)
        await tf.setBackend('webgl')
    }
    const queue = tf.backend().queue

    // https://github.com/SystemErrorWang/White-box-Cartoonization
    // https://github.com/vladmandic/anime
    const cartoon = await tf.loadGraphModel('cartoon/whitebox.json')

    const models = {'pose': poseLandmarker, 'segment': imageSegmenter, 'cartoon': cartoon}
    const canvasCtx = canvas.getContext('2d')
    const drawingUtils = new DrawingUtils(canvasCtx)

    const trackProcessor = new MediaStreamTrackProcessor({ track: track })
    const trackGenerator = new MediaStreamTrackGenerator({ kind: 'video' })
    let yuv, rgba
    const transformer = new TransformStream({
        async transform(videoFrame, controller) {
            const W = videoFrame.codedWidth
            const H = videoFrame.codedHeight
            if (effect.value.includes('landmarks'))
                effect_funcs['pose_landmarks'](videoFrame, poseLandmarker, canvasCtx, drawingUtils)
            else
                canvasCtx.clearRect(0, 0, canvas.width, canvas.height)
            let rgba = new Uint8ClampedArray(W * H * 4)
            if (effect.value == 'pose_landmarks')
                rgba = rgba.map((_, i) => ((i+1) % 4 == 0) * 255)
            else {
                const yuv = new Uint8Array(W * H * 1.5)
                const copyResult = await videoFrame.copyTo(yuv)
                const { stride, offset: Voffset } = copyResult[1]
                const { offset: Uoffset } = copyResult[2]
                effect_funcs[effect.value](W, H, stride, Voffset, Uoffset, yuv, rgba, models, videoFrame)
                if (effect.value.includes('webgpu'))
                    await queue.onSubmittedWorkDone()
            }
            const init = {
                codedHeight: H,
                codedWidth: W,
                format: 'RGBA',
                timestamp: videoFrame.timestamp,
            }
            videoFrame.close()
            controller.enqueue(new VideoFrame(rgba, init))
        }
    })
    const transformed = trackProcessor.readable.pipeThrough(transformer).pipeTo(trackGenerator.writable)
    out_video.srcObject = new MediaStream([trackGenerator])
}

function capture_select(input_elem) {
    capture().then(() => input_elem.select())
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

function toggle_fullscreen(event_or_elem, landscape=true, elem) {
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
        elem.requestFullscreen({navigationUI: 'hide'}).catch(e => console.warn(e.message))
    } else
        document.exitFullscreen()
    return was_not_fullscreen_before
}