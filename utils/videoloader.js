export default function load_video(input, video_elem) {
    input = input.value ?? input
    let [vid_id, params, hash_params] = [...input.split(/(?:[?&]|(?=#))([^#]*)/), '', '']
    if (vid_id.includes('=')) {
        if (params)
            params = '&' + params
        params = vid_id + params
        vid_id = ''
    }
    params = new URLSearchParams(params)
    let v = params.get('v')
    if (v) {
        params.delete('v')
        if (vid_id)
            vid_id += '?v='
        vid_id += v
    }
    if (vid_id.includes('/') && vid_id.includes('.') && !vid_id.includes('://')) {
        vid_id = 'https://' + vid_id
        input = 'https://' + input
    }

    let host = ''
    let vid_id2 = vid_id
    try {
        const input_url = new URL(vid_id)
        host = input_url.hostname
        const path_parts = input_url.pathname.split('/')
        vid_id = v || path_parts.at(-1)
        vid_id2 = path_parts.slice(-2).join('/')
    } catch {}

    let url = 'about:blank'
    let hash = ''
    if (host.includes('vimeo') || vid_id.match(/^\d+\/?\w*$/) || vid_id2.match(/^\d+\/?\w*$/)) {  // Vimeo
        if (!vid_id.match(/^\d+$/))
            vid_id = vid_id2
        if (vid_id.includes('/')) {
            let secret
            [vid_id, secret] = vid_id.split('/')
            params.set('h', secret)
        }
        hash = vid_id
        if (params.size)
            hash += '?' + params
            params = '&' + params
        hash += hash_params
        params += hash_params
        url = `https://player.vimeo.com/video/${vid_id}?autoplay=1&byline=0&dnt=1&loop=1&&muted=1&portrait=0&quality=1080p&title=0${params}`

    }
    else if (host && !host.includes('youtu')) {  // Any non YouTube / Vimeo URL
        url = input
        hash = input.match(/(.*?https:\/\/)?(.*)/).at(-1)
    } else if (input) {  // YouTube
        let playlist_params = '&playlist=' + vid_id
        if (params.size) {
            let t = (params.get('t') || '').match(/\d+/)
            if (t) {
                params.delete('t')
                params.set('start', t)
            }
            if (params.has('list') || params.has('playlist'))
                playlist_params = ''
            params = '&' + params
        }
        url = `https://www.youtube-nocookie.com/embed/${vid_id}?autoplay=1&loop=1${playlist_params}&playsinline=1&rel=0${params}&mute=1`
        hash = vid_id + params
        if (video_elem)
            video_elem.onload = () => {video_elem.onload = ''; video_elem.src = url}  // Reload to overcome "This video is unavailable" error on first load of video with playlist parameter. See: https://issuetracker.google.com/issues/249707272
    }
    if (video_elem)
        orig_video.src = url
    return [hash.slice(hash[0] == '&'), url]
}