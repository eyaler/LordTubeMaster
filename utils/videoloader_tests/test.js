import load_video from '../videoloader.js'

const tests = {
    '': '',
    '59bH4FhOVkA': `
https://www.youtube.com/watch?v=59bH4FhOVkA
https://www.youtube-nocookie.com/watch?v=59bH4FhOVkA
https://www.youtube.com/embed/59bH4FhOVkA
https://www.youtube-nocookie.com/embed/59bH4FhOVkA
https://youtu.be/59bH4FhOVkA
www.youtube.com/watch?v=59bH4FhOVkA
www.youtube-nocookie.com/watch?v=59bH4FhOVkA
www.youtube.com/embed/59bH4FhOVkA
www.youtube-nocookie.com/embed/59bH4FhOVkA
youtu.be/59bH4FhOVkA
59bH4FhOVkA
?v=59bH4FhOVkA
&v=59bH4FhOVkA
v=59bH4FhOVkA
`,
    '59bH4FhOVkA&playlist=59bH4FhOVkA': `
https://www.youtube.com/watch?v=59bH4FhOVkA&playlist=59bH4FhOVkA
https://www.youtube.com/watch?playlist=59bH4FhOVkA&v=59bH4FhOVkA
https://www.youtube.com/embed/59bH4FhOVkA?playlist=59bH4FhOVkA
www.youtube.com/watch?v=59bH4FhOVkA&playlist=59bH4FhOVkA
www.youtube.com/watch?playlist=59bH4FhOVkA&v=59bH4FhOVkA
www.youtube.com/embed/59bH4FhOVkA?playlist=59bH4FhOVkA
?v=59bH4FhOVkA&playlist=59bH4FhOVkA
&v=59bH4FhOVkA&playlist=59bH4FhOVkA
v=59bH4FhOVkA&playlist=59bH4FhOVkA
59bH4FhOVkA&playlist=59bH4FhOVkA
?playlist=59bH4FhOVkA&v=59bH4FhOVkA
&playlist=59bH4FhOVkA&v=59bH4FhOVkA
playlist=59bH4FhOVkA&v=59bH4FhOVkA
`,
    'playlist=59bH4FhOVkA': `
https://www.youtube.com/embed/?playlist=59bH4FhOVkA
www.youtube.com/embed/?playlist=59bH4FhOVkA
?playlist=59bH4FhOVkA
&playlist=59bH4FhOVkA
playlist=59bH4FhOVkA
`,
    '59bH4FhOVkA&list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS': `
https://www.youtube.com/watch?v=59bH4FhOVkA&list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS
https://www.youtube.com/watch?list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS&v=59bH4FhOVkA
https://www.youtube.com/embed/59bH4FhOVkA?list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS
www.youtube.com/watch?v=59bH4FhOVkA&list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS
www.youtube.com/watch?list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS&v=59bH4FhOVkA
www.youtube.com/embed/59bH4FhOVkA?list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS
?v=59bH4FhOVkA&list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS
&v=59bH4FhOVkA&list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS
v=59bH4FhOVkA&list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS
59bH4FhOVkA&list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS
?list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS&v=59bH4FhOVkA
&list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS&v=59bH4FhOVkA
list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS&v=59bH4FhOVkA
`,
    'list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS': `
https://www.youtube.com/embed/?list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS
www.youtube.com/embed/?list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS
?list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS
&list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS
list=PLZV8sKAO3LzbA18GxCub2j_2ZpwJENDAS
`,
    '214118908': `
https://vimeo.com/214118908
https://player.vimeo.com/video/214118908
vimeo.com/214118908
player.vimeo.com/video/214118908
214118908
`,
    '214118908#t=0m10s': `
https://vimeo.com/214118908#t=0m10s
https://player.vimeo.com/video/214118908#t=0m10s
vimeo.com/214118908#t=0m10s
player.vimeo.com/video/214118908#t=0m10s
214118908#t=0m10s
`,
    '214118908?autoplay=1#t=0m10s': `
https://vimeo.com/214118908?autoplay=1#t=0m10s
https://player.vimeo.com/video/214118908?autoplay=1#t=0m10s
vimeo.com/214118908?autoplay=1#t=0m10s
player.vimeo.com/video/214118908?autoplay=1#t=0m10s
214118908?autoplay=1#t=0m10s
`,
    '304887422?h=34c51f7a09': `
https://vimeo.com/304887422/34c51f7a09
vimeo.com/304887422/34c51f7a09
304887422/34c51f7a09
https://player.vimeo.com/video/304887422?h=34c51f7a09
player.vimeo.com/video/304887422?h=34c51f7a09
`,
    '304887422?autoplay=1&h=34c51f7a09': `
https://vimeo.com/304887422/34c51f7a09?autoplay=1
vimeo.com/304887422/34c51f7a09?autoplay=1
304887422/34c51f7a09?autoplay=1
https://player.vimeo.com/video/304887422?autoplay=1&h=34c51f7a09
player.vimeo.com/video/304887422?autoplay=1&h=34c51f7a09
`,
    'www.dailymotion.com/video/x6ch8i5': `
https://www.dailymotion.com/video/x6ch8i5
www.dailymotion.com/video/x6ch8i5
`,
    'http://www.dailymotion.com/video/x6ch8i5': `
http://www.dailymotion.com/video/x6ch8i5
`,
}

let cnt = 0

Object.entries(tests).forEach(([hash, urls]) => {
    urls = urls.split('\n').filter(x => x)
    const dupes = urls.length - new Set(urls).size
    if (dupes)
        throw new Error(`Found duplicates ${dupes} for ${hash}`)
    urls.forEach(url => {
        const result = load_video(url)[0]
        if (result != hash)
            throw new Error(`${url} gave ${result} instead of ${hash}`)
        cnt++
    })
})
console.log(`All ${cnt} tests passed`)