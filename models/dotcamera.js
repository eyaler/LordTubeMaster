// From https://github.com/google/swissgl/blob/main/demo/DotCamera.js

/** @license
  * Copyright 2023 Google LLC.
  * SPDX-License-Identifier: Apache-2.0 
  */

export default class DotCamera {
    constructor(glsl, {dayMode=false, rgbMode=false}={}) {
        this.glsl = glsl;
        this.dayMode = dayMode;
        this.rgbMode = rgbMode;
    }

    frame(video, {canvasSize, DPR=devicePixelRatio, random_mode}) {
        const dayMode = (random_mode/2|0) % 2 != this.dayMode;
        const rgbMode = random_mode % 2 != this.rgbMode;
        const tex = this.glsl({}, {data:video, tag:'video'});
        canvasSize = canvasSize ?? tex.size;
        const blendParams = dayMode ? {Clear:1, Blend:'d-s'} : {Clear:0, Blend:'d+s'};
        const lum = this.glsl({tex:tex.edge.linear, ...blendParams, rgbMode,
            VP:`vec2 r = vec2(ViewSize)/vec2(tex_size()); r /= max(r.x, r.y); VPos.xy = XY/r;`, FP:`
            FOut = tex(UV);
            if (!rgbMode) {
                FOut.r = dot(FOut.rgb, vec3(0.2126,0.7152,0.0722));
            }`},
            {scale:1/2/DPR, tag:'lum'});
        const merged = this.glsl({T:lum.edge.miplinear, FP:`
            for (float lod=0.; lod<8.0; lod+=1.0) {FOut += textureLod(T, UV, lod);}
            FOut /= 8.0;`}, {size:lum.size, format:'rgba16f', tag:'merged'});
        const imgForce = this.glsl({T:merged.edge, FP:`
            vec2 s=T_step();
            vec4 a=T(UV-s), b=T(UV+vec2(s.x,-s.y)), c=T(UV+vec2(-s.x,s.y)), d=T(UV+s);
            FOut = b+d-a-c; FOut1 = c+d-a-b;`
        }, {size:lum.size, layern:2, format:'rgba16f', tag:'grad'});

        const arg = {canvasSize, rgbMode};
        const field = this.glsl({}, {scale:1/4/DPR, format:'rgba16f', layern:3, filter:'linear', tag:'field'});
        let points;
        for (let i=0; i<10; ++i) {
            points = this.glsl({...arg, field:field.edge, imgForce:imgForce.edge.linear, seed: Math.random()*124237, FP: `
                int c = rgbMode ? I.x%3 : 0;
                vec4 p=Src(I), f=field(p.xy, c);
                if (p.w == 0.0) {
                    FOut = vec4(hash(ivec3(I, seed)).xy, 0.0, 1.0);
                    return;
                }
                if (f.z>3.0) {p.xy = hash(ivec3(I,seed)).xy;}
                vec2 imf = vec2(imgForce(p.xy,0)[c], imgForce(p.xy,1)[c]);
                vec2 force = f.xy*10.0 + imf.xy*20.0;
                p.xy = clamp(p.xy + force/canvasSize, vec2(0), vec2(1));
                FOut = p;
            `}, {scale:(rgbMode?1.7:1)/8/DPR, story:2, format:'rgba32f', tag:'points'});
            this.glsl({...arg, points:points[0], Grid: points[0].size, Blend:'s+d', Clear:0, VP:`
                VPos.xy = (points(ID.xy).xy + XY*15.0/canvasSize)*2.0-1.0;
                int c = rgbMode ? ID.x%3 : 0;
                varying vec3 color = vec3(c==0,c==1,c==2);`,FP:`
                vec4 v = vec4(vec3(XY,1.)*exp(-dot(XY,XY)*vec3(4,4,8)), 0);
                FOut=v*color.r; FOut1=v*color.g; FOut2=v*color.b;`}, field)
        }
        // draw dots on screen
        this.glsl({...arg, points:points[0], Grid: points[0].size, ...blendParams, VP:`
            VPos.xy = (points(ID.xy).xy + XY*4.0/canvasSize)*2.0-1.0;
            int c = ID.x%3;
            varying vec3 color = rgbMode ? vec3(c==0,c==1,c==2) : vec3(1);`,
            FP:`color*exp(-dot(XY,XY)*3.0),1`})
    }
}