// Based on https://www.airtightinteractive.com/2011/06/rutt-etra-izer/
// Original RuttEtraIzer by Felix Turner www.airtight.cc

const scale_rate = .01
const min_scale = 1
const max_scale = 10
const rot_rate_x = .0005
const rot_rate_y = .0002
const min_rot = .4
const max_rot = .6

let scale = 2
let pointer_x = .5
let pointer_y = .5
let rot_dir_x = 1
let rot_dir_y = 1
let down_x
let down_y

export default class RuttEtraIzer {
    constructor(THREE, renderer, canvas) {
        this.THREE = THREE
        this.renderer = renderer
        this.camera = new THREE.PerspectiveCamera(90, 16 / 9, 1, 3000)
        this.scene = new THREE.Scene()

        this.material = new THREE.LineBasicMaterial({
            color: 0xffffff,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            vertexColors: true,
        })

        canvas.addEventListener('pointerdown', e => {if (!e.button) {down_x = e.clientX; down_y = e.clientY}})

        document.addEventListener('pointerup', () => down_x = down_y = null)

        document.addEventListener('pointermove', e => {
            if (down_x != null && down_y != null && down_x != e.clientX && down_y != e.clientY) {
                const b = canvas.getBoundingClientRect()
                pointer_x = Math.max(0, Math.min((e.clientX-b.left) / b.width, 1))
                pointer_y = Math.max(0, Math.min((e.clientY-b.top) / b.height, 1))
                down_x = e.clientX
                down_y = e.clientY
		    }
        })

        canvas.addEventListener('wheel', e => scale = Math.max(min_scale, Math.min(scale + e.deltaY*scale_rate, max_scale)), {passive: true})
    }

    frame(W, H, rgbx, {scanStep=7, depth=100, random_mode}={}) {
        const THREE = this.THREE

        if (this.lineGroup) {
            this.scene.remove(this.lineGroup)
            this.lineGroup.traverse(obj => obj.geometry?.dispose())
        }
        this.lineGroup = new THREE.Group()

        for (let y = 0; y < H; y += scanStep) {
            const points = []
            const colors = []
            for (let x = 0; x < W; x += scanStep) {
                const index4 = (x+y*W) * 4
                let color = new THREE.Color(rgbx[index4] / 255, rgbx[index4 + 1] / 255, rgbx[index4 + 2] / 255)
                const brightness = .2126*color.r + .7152*color.g + .0722*color.b
                points.push(new THREE.Vector3(x - W/2, H/2 - y, brightness * depth))
                color = color.convertSRGBToLinear()
                colors.push(color.r, color.g, color.b)
            }
            const geometry = new THREE.BufferGeometry().setFromPoints(points)
            geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))
            this.lineGroup.add(new THREE.Line(geometry, this.material))
        }
        if (random_mode) {
            const rand = Math.random()
            if (rand > .5) {
                pointer_x += rot_dir_x * rot_rate_x
                if (pointer_x < min_rot || pointer_x > max_rot) {
                    pointer_x = Math.max(min_rot, Math.min(pointer_x, max_rot))
                    rot_dir_x *= -1
                }
            } else {
                pointer_y += rot_dir_y * rot_rate_y
                if (pointer_y < min_rot || pointer_y > max_rot) {
                    pointer_y = Math.max(min_rot, Math.min(pointer_y, max_rot))
                    rot_dir_y *= -1
                }
            }
        }
        this.lineGroup.scale.setScalar(scale)
	    this.lineGroup.rotation.x = (pointer_y*2-1)*Math.PI
	    this.lineGroup.rotation.y = (pointer_x*2-1)*Math.PI
	    this.scene.add(this.lineGroup)
	    if (this.camera.position.z != H)
	        this.camera.position.z = H
        this.renderer.render(this.scene, this.camera)
    }
}