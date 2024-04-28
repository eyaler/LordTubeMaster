// Note as of April 2024 this is only supported on Chromium desktop
// For fullscreen zoom of output, enable: chrome://flags/#element-capture

import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/vision_bundle.mjs'

video_url.addEventListener('change', e => get_video(e.currentTarget))
video_url.addEventListener('keydown', e => {if (e.key == 'Enter' || e.key == 'Tab') get_video(e.currentTarget)})
video_url.addEventListener('focus', e => {if (e.currentTarget.value) {e.currentTarget.select(); capture()}})

function get_video(input_elem) {
    let host = ''
    let vid_id = input_elem.value
    let url = 'about:blank'
    try {
        const input_url = new URL(vid_id)
        host = input_url.hostname
        vid_id = input_url.searchParams.get('v') || input_url.pathname.split('/').at(-1)
    } catch {}
    if (host.includes('vimeo') || vid_id.match(/^\d+$/))
        url = `https://player.vimeo.com/video/${vid_id}?autoplay=1&byline=0&dnt=1&loop=1&&muted=1&portrait=0&quality=1080p&title=0`
    else if (vid_id)
        url = `https://www.youtube-nocookie.com/embed/${vid_id}?autoplay=1&loop=1&playlist=${vid_id}&playsinline=1&rel=0&mute=1`
    orig_video.src = url
    capture()
}

let lastVideoTime = -1

const effect_funcs = {
    'pose_landmarks': (videoFrame, poseLandmarker, drawingUtils) => {
        let startTimeMs = performance.now()
        if (lastVideoTime != videoFrame.timestamp) {
            lastVideoTime = videoFrame.timestamp
            poseLandmarker.detectForVideo(videoFrame, startTimeMs, (result) => {
                for (const landmark of result.landmarks) {
                    drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS, { color: 'lime', lineWidth: 1 })
                    drawingUtils.drawLandmarks(
                        landmark,
                        { color: 'red', fillColor: 'red', lineWidth: 0, radius: 1 }
                    )
                }
            })
        }
    },

    'pixel_sorting': (W, H, stride, Voffset, Uoffset, yuv, rgba) => {
        for (let y = 0; y < H; y++) {
            const yUV = (y >> 1) * stride
            const line = []
            for (let x = 0; x < W; x++) {
                const xUV = x >> 1
                const Y = yuv[x + y*W]
                const U = yuv[Voffset + xUV + yUV] - 128
                const V = yuv[Uoffset + xUV + yUV] - 128
                line.push({Y, U, V})
            }
            line.sort((a, b) => (a.Y - b.Y))
            for (let x = 0; x < W; x++) {
                const {Y, U, V} = line[x]
                let R = sat(Y + 1.5748*V)
                let G = sat(Y - 0.4681*V - 0.1873*U)
                let B = sat(Y + 1.8556*U)
                rgba[0 + x*4 + y*W*4] = R
                rgba[1 + x*4 + y*W*4] = G
                rgba[2 + x*4 + y*W*4] = B
                rgba[3 + x*4 + y*W*4] = 255
            }
        }
        return rgba
    },

    'bayer_dithering': (W, H, stride, Voffset, Uoffset, yuv, rgba) => {
        const bayer_r = 128
        const threshold = 128
        const matrix =
             [[ -0.5 ,  0    ],
              [  0.25, -0.25 ]]
        const bayer_n = matrix.length
        for (let y = 0; y < H; y++) {
            const yUV = (y >> 1) * stride
            for (let x = 0; x < W; x++) {
                const xUV = x >> 1
                const Y = yuv[x + y*W]
                const U = yuv[Voffset + xUV + yUV] - 128
                const V = yuv[Uoffset + xUV + yUV] - 128
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
                rgba[0 + x*4 + y*W*4] = R
                rgba[1 + x*4 + y*W*4] = G
                rgba[2 + x*4 + y*W*4] = B
                rgba[3 + x*4 + y*W*4] = 255
            }
        }
        return rgba
    },

    'recode_original': (W, H, stride, Voffset, Uoffset, yuv, rgba) => {
        for (let y = 0; y < H; y++) {
            const yUV = (y >> 1) * stride
            const line = []
            for (let x = 0; x < W; x++) {
                const xUV = x >> 1
                const Y = yuv[x + y*W]
                const U = yuv[Voffset + xUV + yUV] - 128
                const V = yuv[Uoffset + xUV + yUV] - 128
                let R = sat(Y + 1.5748*V)
                let G = sat(Y - 0.4681*V - 0.1873*U)
                let B = sat(Y + 1.8556*U)
                rgba[0 + x*4 + y*W*4] = R
                rgba[1 + x*4 + y*W*4] = G
                rgba[2 + x*4 + y*W*4] = B
                rgba[3 + x*4 + y*W*4] = 255
            }
        }
        return rgba
    },
}

effect_funcs['recode_landmarks'] = effect_funcs['recode_original']

function sat(val) {
  if (val > 255) return 255
  if (val < 0) return 0
  return val | 0
}

let capture_started
const unsupported = '<p>Not supported by your browser :( Try in Chromium desktop!</p>'

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
        console.error(e)
        if (e instanceof TypeError)
            out_video.outerHTML = unsupported
        else
            capture_started = false
        return
    }
    const [track] = stream.getVideoTracks()
    track.addEventListener('ended', () => capture_started = false)
    try {
        // Enable chrome://flags/#element-capture - this will also enable fullscreen zoom of output
        // See: https://developer.chrome.com/docs/web-platform/element-capture
        // Note that pinch zoom pauses the stream: https://issuetracker.google.com/issues/337337168
        const restrictionTarget = await RestrictionTarget.fromElement(orig_video)
        await track.restrictTo(restrictionTarget)
        out_container.oncontextmenu = e => toggle_fullscreen(e)
        out_container.title = 'Right-click to enter/exit fullscreen'
    } catch (e) {
        console.error(e)
        try {
            const cropTarget = await CropTarget.fromElement(orig_video)
            await track.cropTo(cropTarget)
        } catch (e){
            console.error(e)
            out_video.outerHTML = unsupported
            return
        }
    }

    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm')
    const poseLandmarker = await PoseLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numPoses: 2
        })
    const canvasCtx = canvas.getContext('2d');
    const drawingUtils = new DrawingUtils(canvasCtx);

    const trackProcessor = new MediaStreamTrackProcessor({ track: track })
    const trackGenerator = new MediaStreamTrackGenerator({ kind: 'video' })
    let yuv, rgba
    const transformer = new TransformStream({
        async transform(videoFrame, controller) {
            const W = videoFrame.codedWidth
            const H = videoFrame.codedHeight
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height)

            let rgba = new Uint8Array(W * H * 4)
            if (effect.value.includes('landmarks')) {
                canvasCtx.save()
                effect_funcs['pose_landmarks'](videoFrame, poseLandmarker, drawingUtils)
                canvasCtx.restore()
            }
            if (effect.value == 'pose_landmarks')
                rgba = rgba.map((_, i) => ((i+1) % 4 == 0) * 255)
            else {
                const yuv = new Uint8Array(W * H * 1.5)
                const copyResult = await videoFrame.copyTo(yuv)
                const { stride, offset: Voffset } = copyResult[1]
                const { offset: Uoffset } = copyResult[2]
                rgba = effect_funcs[effect.value](W, H, stride, Voffset, Uoffset, yuv, rgba)
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


// FULLSCREEN


let wake_lock


function request_wake_lock() {
    navigator.wakeLock?.request('screen').then(lock => wake_lock = lock).catch(e => console.error(e.message))
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
                        screen.orientation.lock('landscape').catch(e => console.error(e.message))  // Works only in Chrome Android. See: https://bugzilla.mozilla.org/show_bug.cgi?id=1744125
                    request_wake_lock()
                    document.addEventListener('visibilitychange', visibility_change_handler)
                } else
                    wake_lock?.release().then(() => wake_lock = null)
            })
        }
        elem.requestFullscreen({navigationUI: 'hide'}).catch(e => console.error(e.message))
    } else
        document.exitFullscreen()
    return was_not_fullscreen_before
}