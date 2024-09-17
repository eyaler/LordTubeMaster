// Based on https://www.airtightinteractive.com/2011/06/rutt-etra-izer/
// Original RuttEtraIzer by Felix Turner www.airtight.cc

const scale_rate = .01
let scale = 2
let pointer_x = .5
let pointer_y = .5
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

        canvas.addEventListener('pointerdown', e => {down_x = e.clientX; down_y = e.clientY})

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

        canvas.addEventListener('wheel', e => scale = Math.max(1, Math.min(scale + e.deltaY*scale_rate, 10)), {passive: true})
    }

    frame(W, H, rgbx, {scanStep=7, depth=100}={}) {
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
        this.lineGroup.scale.setScalar(scale)
	    this.lineGroup.rotation.x = (pointer_y*2-1)*Math.PI
	    this.lineGroup.rotation.y = (pointer_x*2-1)*Math.PI
	    this.scene.add(this.lineGroup)
	    if (this.camera.position.z != H)
	        this.camera.position.z = H
        this.renderer.render(this.scene, this.camera)
    }
}