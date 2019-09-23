class Transformation {
	constructor (
		numDimensions,
		func,
		{progressMethod = 'multiplyBefore', scale} = {}
	) {
		// TODO: require 'custom' instead of guessing it? (stricter validation)
		if (func.length === 3) progressMethod = 'custom';
		// TODO: add function validation
		this.func = func;
		// this.numDimensions = func([]).length;
		this.numDimensions = numDimensions;
		this.options = {
			"progressMethod": progressMethod,
			"scale": scale
			// scaleInput, scaleOutput, inputRange, outputRange
		};
		
		// make Transformation immutable
		Object.freeze(this);
	}
	
	getScaledPosition(position) {
		return position.map((component,i) => component*this.options.scale[i]);
	}
	
	calcFunc(position, point, progress = 1, thisArg) {
		// TODO: validation, position.length === this.numDimensions, progress range [0,1]
		
		// TODO: perform scaling and check before calling 'getProgressedPosition' method
		let pos = (this.options.scale) ? this.getScaledPosition(position) : position;
		if (progress === 1 && this.options.progressMethod !== 'custom') {
			return this.func.call(thisArg, pos, point, progress);
		}
		// progressedComponent = this.func.call(thisArg, componentsArray, i, point, progress);
		switch (this.options.progressMethod) {
			case 'multiplyBefore':
				// f(k*x, k*y, k*z)
				// multiply components by progress, then evaluate
				pos = this.func.call(thisArg, pos.map(comp => progress*comp), point, progress);
				break;
			case 'multiplyAfter':
				// k*func(x,y,z)
				// evaluate with position components, then multiply by progress
				pos = progress*this.func.call(thisArg, pos, point, progress);
				break;
			case 'custom':
				// multiply by progress as defined by user with extra func argument
				pos = this.func.call(thisArg, pos, point, progress);
				break;
		}
		return position.map((component,i) => pos[i] + (1-progress)*component);
	}
}

class Point {
	constructor(position, dataObject = {}) {
		this.position = position;
		this.data = dataObject;
		this.numDimensions = this.position.length;
	}
	
	// iterates components of this.position
	*[Symbol.iterator]() {
		for (let component of this.position) {
			yield component;
		}
	}
	
	static clone(self) {
		let pointClone = Object.assign(Object.create(Object.getPrototypeOf(self)), self);
		pointClone.position = self.position.slice(0);
		// shallow copy
		pointClone.data = Object.assign({}, self.data);
		return pointClone;
		// return new Point(self.position.slice(0), Object.assign({}, self.data));
	}
	
	// transforms clone of this and returns Point clone
	transformMap(transformations, progress) {
		return Point.clone(this).transform(transformations, progress);
	}
	
	// updates this.position and returns this
	transform(transformations, progress, thisArg = this) {
		// TODO: validation for progress between [0,1]
		this.position = transformations.reduce((position, transformation, transIndex) => {
			if (transIndex > 0) progress = 1;
			return transformation.calcFunc(position, this, progress, thisArg);
		}, this.position);
		return this;
	}
}

class Curve {
	constructor(points, dataObject = {}) {
		// TODO: valiation for array of points
		this.points = points;
		this.data = dataObject;
	}
	
	// iterates points of this.points
	*[Symbol.iterator]() {
		for (let point of this.points) {
			yield point;
		}
	}
}

class Field {
	constructor (
		size,
		domain = [...Array(size.length)].map(() => {return {initial: null, final: null}}), 
		{transformations = []} = {},
		dataObject = {}
	) {
		this.size = size;
		this.numDimensions = this.size.length;
		this.numPoints = this.size.reduce((acc, numPoints) => acc * numPoints, 1);
		
		this.domain = domain.map((el, i) => {
			if (typeof el === 'number') {
				el = {initial: el, final: el};
			} else if (el instanceof Array) {
				el = {initial: el[0], final: el[1]};
			}
			
			// TODO: better validation for size 1 - probably be explicit and throw error in this case
			if (this.size[i] === 1 && el.initial !== el.final) {
				el.final = el.initial;
			}
			
			return el;
		});
		
		// properties that use a lazy getter
		this._componentCurves;
		this._numCurves;
		
		// create array of evenly spaced, cartesian points
		const repeatArr = this.size.map((_, i, arr) => {
			return arr.reduce((repeatVal, numPoints, j) => {
				return repeatVal *= (j > i) ? numPoints : 1;
			}, 1);
		});
		const stepSize = [...Array(this.numDimensions)].map((_, i) => {
			return (this.size[i] === 1)
				? 0
				: (this.domain[i].final - this.domain[i].initial) / (this.size[i] - 1);
		});
		// TODO: make flat array with getter method?
		this.positionsCartesian = [...Array(this.numPoints)];
		this.points = [...Array(this.numPoints)];
		for (let i = 0; i < this.numPoints; i++) {
			let coordinateComponents = [...Array(this.numDimensions)];
			let position = [...Array(this.numDimensions)];
			// set Point position (Cartesian) and coordinateComponents index for each component based on domain, stepSize, repeatArr, and coordinateComponents
			this.size.forEach((numPoints, j) => {
				coordinateComponents[j] = Math.floor(i / repeatArr[j]) % numPoints;
				position[j] = this.domain[j].initial + coordinateComponents[j] * stepSize[j];
			})
			this.positionsCartesian[i] = position;
			this.points[i] = new Point(position, {'coordinateComponents': coordinateComponents});
		}
		
		this.transformations = [];
		// this.transform adds any transformations to this.transformations array
		if (transformations.length > 0) {
			this.transform(transformations);
		}
		
		this.data = dataObject;
	}
	
	static clone(self) {
		let fieldClone = Object.assign(Object.create(Object.getPrototypeOf(self)), self);
		// fieldClone.pointsCartesian = fieldClone.pointsCartesian.map(point => Point.clone(point));
		fieldClone.size = self.size.slice(0);
		fieldClone.domain = self.domain.map(el => Object.assign({}, el));
		// fieldClone.componentCurves = self.componentCurves.slice(0);
		fieldClone.points = fieldClone.points.map(point => Point.clone(point));
		fieldClone.transformations = fieldClone.transformations.slice(0);
		// TODO: add deep clone support for arrays, possibly second-level object literals
		fieldClone.data = Object.assign({}, self.data);
		return fieldClone;
	}
	
	// iterates points of this.points
	*[Symbol.iterator]() {
		for (let point of this.points) {
			yield point;
		}
	}
	
	// lazy getters
	get componentCurves() {
		return this._componentCurves = this._componentCurves ||
			this.size.map((numPoints, i, arr) => {
				if (numPoints === 1) {
					return 0;
				} else {
					return arr.reduce((acc, numPoints, j) => {
						return acc *= (i !== j) ? numPoints : 1;
					}, 1);
				}
			});
	}
	
	get numCurves() {
		return this._numCurves = this._numCurves ||
			this.componentCurves.reduce((acc, numComponentCurves) => acc + numComponentCurves, 0);
	}
	
	// calls transform method on clone of this, returns transformed clone
	transformMap(transformations, progress, thisArg) {
		return Field.clone(this).transform(transformations, progress, thisArg);
	}
	
	// transforms this.points and adds transformations to this.transformations array, returns this
	transform(transformations, progress, thisArg = this) {
		this.transformations = this.transformations.concat(transformations);
		const transReverse = [...this.transformations].reverse();
		// mutates each Point in this.points array
		for (let i = 0; i < this.numPoints; i++) {
			const point = this.points[i];
			point.position = this.positionsCartesian[i];
			point.transform(transReverse, progress, thisArg);
		}
		return this;
	}
	
	getCurveMesh({hideOuterCurves = false} = {}) {
		const options = {
			"hideOuterCurves": hideOuterCurves
		};
		
		const dimensionless = this.size.map(numPoints => numPoints === 1);
		// TODO: add methods to retrieve curve properties from points and vice versa
		// array of component-based multiplier arrays used to place points into appropriate curve sets
		const curveMultipliers = this.size.map((_, componentIndex, size) => {
			//////////////////
			if (dimensionless[componentIndex]) {return null};
			
			// remove element of current component, then remove last element
			let multipliers = size.filter((_,i) => i !== componentIndex);
			multipliers.pop();
			// multiply each element by all elements preceding it
			for (let i = 1; i < multipliers.length; i++) {
				multipliers[i] *= multipliers[i-1];
			}
			// place 1 at beginning of array, then add value of 0 at index of current component
			multipliers.unshift(1);
			multipliers.splice(componentIndex, 0, 0);
			
			//////////////////
			if (dimensionless.includes(true)) {
				multipliers.forEach((_,i,arr) => {if (dimensionless[i]) arr[i] = undefined});
			}
			
			return multipliers;
		});
		
		// array of curve sets for each dimension (x-curveSet, y-curveSet, z-curveSet, ...)
		let curveMesh = this.size.map((numPoints, dimIndex, size) => {
			// array of curves for each curve set (x-curve_0, x-curve_1, ...)
			return [...Array(this.componentCurves[dimIndex])].map((_, curveIndex, curveArr) => {
				const multipliers = curveMultipliers[dimIndex];
				let constantCoordinateComponents = {};
				for (let i = 0; i < multipliers.length; i++) {
					// component where multiplier === 0 is curve's variable component
					// TODO: add surface where multiple number of components can vary
					if (multipliers[i] !== 0) {
						constantCoordinateComponents[i] = (multipliers[i]) ? (Math.floor(curveIndex / multipliers[i]) % curveArr.length) % size[i] : 0;
					}
				}
				return new Curve([...Array(numPoints)], {'constantCoordinateComponents': constantCoordinateComponents});
			});
		});
		
		// fill curves with points - curves are filled after creation of curveMesh array for performance reasons
		//// only need to iterate this.points 1 time, instead of {this.numDimensions} times
		for (const point of this) {
			// point gets added once to each dimension of curve sets
			//// point will be part of n curves, where n = this.numDimensions = point.data.coordinateComponents.length
			point.data.coordinateComponents.forEach((coordComponent, i, arr) => {
				//////////////////
				if (dimensionless[i]) return;
				// convert point's coordinateComponets to curve set index 
				const curveIndex = arr.reduce((acc, componentVal, j) => {
						let multiplier = curveMultipliers[i][j];
						if (!multiplier) multiplier = 0;
						return acc += multiplier*componentVal;
					}
			  	,0);

				curveMesh[i][curveIndex].points[coordComponent] = point;
			});
		}
		
		// TODO: add marker to curve data (display: false) instead of removing from array? if not, rename to 'removeOuterCurves'
		if (options.hideOuterCurves) {
			curveMesh = curveMesh.map((curveSet) => {
				return curveSet.filter((curve) => {
					let isInnerCurve = true;
					for (let [key, value] of Object.entries(curve.data.constantCoordinateComponents)) {
						if ((value === 0 || value === this.size[key] - 1) && !dimensionless[key]) {
							isInnerCurve = false;
							break;
						}
					}
					return isInnerCurve;
				});
			})
		}
		
		return curveMesh;
	}
	
	getPoints(...constantComponents) {
		const map = new Map(constantComponents);
		let arr = [];
		for (const point of this) {
			let match = true;
			for (const [key, value] of map) {
				if (point.data.coordinateComponents[key] !== value) {
					match = false;
				}
			}
			if (match) arr.push(point);
		}
		return arr;
	}
}

// TODO: add render method?
class FieldAnimation {
	constructor(numFrames, field, keyframes) {
		this.numFrames = numFrames;
		this.field = Field.clone(field);
		// TODO: keyframes validation, possibly separate object
		this.keyframes = keyframes;
		// TODO: combine frameSet and frames, using frame object with 'keyframe' property
		this.frameSet = [...Array(keyframes.length-1)];
		// flattened version of frameSet
		this.frames = [];
		
		const startTransformations = this.keyframes[0].transformations;
		let currentField = (!startTransformations || startTransformations.length === 0)
			? this.field
			: this.field.transform(startTransformations);
		
		// populate this.frameSet and this.frames
		for (let i = 1; i < this.keyframes.length; i++) {
			const keyframePrev = this.keyframes[i-1];
			const keyframe = this.keyframes[i];
			const numFramesInFrameSet = Math.round((keyframe.progress - keyframePrev.progress) / 100 * numFrames);
			const stepInterval = 1/(numFramesInFrameSet-1);
			const framesArr = [...Array(numFramesInFrameSet)].map((_, i) => currentField.transformMap(keyframe.transformations, i*stepInterval));
			
			this.frameSet[i-1] = framesArr;
			this.frames.push(...framesArr);
			
			if (i !== this.keyframes.length - 1) {
				currentField = currentField.transform(keyframe.transformations);
			}
		}
	}
	
	// iterates frames of this.frames
	*[Symbol.iterator]() {
		for (let frame of this.frames) {
			yield frame;
		}
	}
}

class PointAnimation {
	constructor(numFrames, point, keyframes) {
		this.numFrames = numFrames;
		this.point = Point.clone(point);
		// TODO: keyframes validation, possibly separate object
		this.keyframes = keyframes;
		// TODO: combine frameSet and frames, using frame object with 'keyframe' property
		this.frameSet = [...Array(keyframes.length-1)];
		// flattened version of frameSet
		this.frames = [];
		
		const startTransformations = this.keyframes[0].transformations;
		let currentPoint = (!startTransformations || startTransformations.length === 0)
			? this.point
			: this.point.transform(startTransformations);
		
		// populate this.frameSet and this.frames
		for (let i = 1; i < this.keyframes.length; i++) {
			const keyframePrev = this.keyframes[i-1];
			const keyframe = this.keyframes[i];
			const numFramesInFrameSet = Math.round((keyframe.progress - keyframePrev.progress) / 100 * numFrames);
			const stepInterval = 1/(numFramesInFrameSet-1);
			const framesArr = [...Array(numFramesInFrameSet)].map((_, i) => currentPoint.transformMap(keyframe.transformations, i*stepInterval));
			
			this.frameSet[i-1] = framesArr;
			this.frames.push(...framesArr);
			
			if (i !== this.keyframes.length - 1) {
				currentPoint = currentPoint.transform(keyframe.transformations);
			}
		}
	}
	
	// iterates frames of this.frames
	*[Symbol.iterator]() {
		for (let frame of this.frames) {
			yield frame;
		}
	}
}

// scale factors
const scaleY = 60;
const scaleZ = 30;

let scaleFunc = (val, a_i, a_f, b_i, b_f) => {
	return (val - a_i)*(b_f - b_i)/(a_f - a_i) + b_i;
}

// Transformations
// console.time('transformations');
const terrain = new Transformation(3, function([x,y,z], _, step) {
	return [
		step*x + step*15*Math.random(),
		step*y,
		step*z
	];
});
//// 3D Spherical
const transSpherical = new Transformation(3, ([x,y,z]) => [
		x*Math.cos(y)*Math.sin(z),
		x*Math.sin(y)*Math.sin(z),
		x*Math.cos(z)
	], {scale: [1, 1/scaleY, 1/scaleZ]}
);
// const wavy = new Transformation((x,y,z,step) => [
// 		step*x + step*(y+z)*Math.sin(step*2*Math.PI),
// 		step*y + step*(x+z)*Math.sin(step*2*Math.PI),
// 		step*z + step*(x+y)*Math.sin(step*2*Math.PI)
// 	]
// );
//// 3D experimental
// const transTest = new Transformation((r,a,w,step) => [step*r, -step*a/2, step*w/4]);
//// 2D Radial
const transRadial = new Transformation(2, function([x,y], point, step) {
	return [
		step*x*Math.cos(step*y) + this.data.test,
		step*x*Math.sin(step*y) + point.data.test
	]}, {scale: [1, 1/25]});
console.log(transRadial);
console.log('-----');
const transWavy = new Transformation(2, ([r,theta]) => [
	r + (10+r/30)*Math.cos(theta/Math.PI),
	theta + r/200*Math.PI*10
]);
let testP = new Point([1,.5]).transform([transRadial]);
console.log(transWavy);
//// 3D Cylindrical
// const transCylindrical = new Transformation((x,y,z) => [x*Math.cos(y), x*Math.sin(y), z], {scale: [1, 2/scaleY, 1]});
// console.timeEnd('transformations');

// Field
// console.time('field');
//// 2D
// let field = new Field([dim0.extend(),dim1.extend()]);
// let fieldRadial = new Field([dim0.extend(),dim1.extend()], [transRadial]);
//// 3D
let n_y = 6;
let n_z = 6;
let y_i = 0;
// let y_f = scaleY*Math.PI;
let y_f = 200;
let z_i = 0;
// let z_f = scaleZ*2*Math.PI;
let z_f = 25*2*Math.PI;
const y_step = (y_f - y_i) / (n_y - 1);
const z_step = (z_f - z_i) / (n_z - 1);
y_i -= y_step;
y_f += y_step;
n_y += 2;
z_i -= z_step;
z_f += z_step;
n_z += 2;

let field = new Field([n_y,n_y,n_z], [
	[y_i, y_f],
	[y_i, y_f],
	[z_i, z_f]
]);

let field2D = new Field([n_y,n_z], [
	[y_i, y_f],
	[z_i, z_f]
]);
for (const p of field2D) {
	p.data['test'] = 20;
	p.data['randomVal'] = Math.random();
}
// field2D.transform(transRadial).transform(transWavy);
field2D.data['test'] = 40;
field2D.transform([transRadial,transWavy]);

// field2D.transform(([x,y], step, field) => [
// 	step*x*Math.cos(step*y),
// 	step*x*Math.sin(step*y)
// ], {scale: [1, 1/25]}));

let point = new Point([-150,0]);
let transPoint = new Transformation(2, ([x,y], _, k) => [k*x + k*300, 50*Math.sin(k*2*Math.PI)]);
// let transPoint = new Transformation((x,y) => [2*x, y*y]);
// let pointT = point.transformMap([transPoint],.5);

// let sph = field.transformMap(transSpherical);
// let min = [Infinity, Infinity, Infinity];
// let max = [-Infinity, -Infinity, -Infinity];
// for (const p of sph) {
// 	for (let i = 0; i < p.numDimensions; i++) {
// 		const val = p.position[i];
// 		if (val < min[i]) min[i] = val;
// 		if (val > max[i]) max[i] = val;
// 	}
// }
// Animation
const numFrames = 150;
// console.time('animation');
// 2D
// let animation = new FieldAnimation(numFrames, field, [
// 		{progress: 0},
// 		{progress: 100, transformations: [transRadial]}
// 	]
// );
// 3D
let animation = new FieldAnimation(numFrames, field, [
		{progress: 0, transformations: []},
		{progress: 50, transformations: [transSpherical]},
		{progress: 100, transformations: [terrain]}
	]
);
// let animation = new FieldAnimation(numFrames, field2D, [
// 		{progress: 0},
// 		{progress: 100, transformations: [transRadial]}
// 	]
// );
let pointAnimation = new PointAnimation(20, point, [
	{progress: 0},
	// {progress: 50, transformations: [transPoint]},
	{progress: 100, transformations: [transPoint]}
]);
// console.timeEnd('animation');

// let mesh = field.getCurveMesh();
// console.log(field.points[0] === mesh[1][0].points[0]);

// Curves
// console.time('curves');
let animationCurveSet = animation.frames.map(field => field.getCurveMesh({"hideOuterCurves": false}));
let mesh = field2D.getCurveMesh({"hideOuterCurves": true});
// console.timeEnd('curves');

const fps = 60;
const framesTotal = animation.frames.length;
const frameRepeat = 1;
let rates = [...Array(numFrames-1)];
let drawCurve;
let canvas;
/// P5JS ///
function setup() {
	frameRate(fps);  //default value is 60
	canvas = createCanvas(700, 550, WEBGL);
	// NOTE: +y points downwards
	drawCurve = (curve) => {
		noFill();
		beginShape();
		for (const point of curve) {
			curveVertex(...point.position);
		}
		endShape();
	};
	// noLoop();
}

function draw() {
	// translate(canvas.width/2,canvas.height/2);
	if (frameCount == 1) console.time('draw');
	
	const frame = Math.floor(frameCount / frameRepeat);
	let animationIndex = frame % framesTotal;
	if ((frame % (2*framesTotal)) > (framesTotal-1)) {
		animationIndex = Math.abs((framesTotal-1) - animationIndex);
	}

	colorMode(HSB);
	// background(...animationSet[animationIndex].data.color);
	background('#fafafa');
	rotateX(frameCount * 0.01);
	rotateY(frameCount * -0.01);
	// rotateZ(frameCount * -0.04);
	// rotateX(Math.PI/2 - frameCount*.0015);
	// rotateZ(-frameCount*.001);
	// rotateY(.4);
	rotateZ(.2);
	
	let currentCurveSet = animationCurveSet[animationIndex];
	
	// // x-curves
	stroke('orange');
	mesh[0].forEach(curve => drawCurve(curve));
	currentCurveSet[0].forEach(curve => drawCurve(curve));
	// // y-curves
	stroke('green');
	mesh[1].forEach(curve => drawCurve(curve));
	currentCurveSet[1].forEach(curve => drawCurve(curve));
	// z-curves
	stroke('purple');
	currentCurveSet[2].forEach(curve => drawCurve(curve));
	
	
	// all points
	// normalMaterial();
	// noStroke();
	// fill('purple');
	// for (const p of animation.frames[animationIndex]) {
	// // for (const p of field) {
	// 	push();
	// 	translate(...p.position);
	// 	sphere(5);
	// 	// circle(...p.position,8);
	// 	pop();
	// }
	
	noStroke();
	fill('purple');
	for (const p of pointAnimation) {
		push();
	// 	// translate(...p.position);
	// 	// sphere(10);
		circle(...p.position,8);
		pop();
	}
	
	rates[animationIndex-1] = frameRate();
	if (animationIndex == framesTotal-1) {
		console.timeEnd('draw');
		const averageFPS = rates.reduce((acc, el) => acc+=el, 0) / rates.length;
		console.log(Math.round(averageFPS) + ' fps');
		noLoop();
	}
}
