// class Dimension {
// 	constructor(numPoints, initial, final) {
// 		// TODO: okay to use arguments param?
// 		Dimension.validate(...arguments);
		
// 		this.numPoints = numPoints;
// 		this.initial = initial;
// 		this.final = final;
// 		this.stepSize = (initial !== final) ? (final - initial) / (numPoints - 1) : 0;
		
// 		// make Dimension immutable
// 		Object.freeze(this);
// 	}
	
// 	// TODO: use static validation method for all classes? (check proper way to pass in arguments - what if something changes and the validation breaks?)
// 	static validate(numPoints, initial, final) {
// 		// check if numPoints is an integer value
// 		let hasIntegerNumPoints = numPoints % 1 === 0;
// 		if (!hasIntegerNumPoints) {
// 			throw new Error('Field Dimension Error: dimension must have an integer value for numPoints');
// 		}
// 		// // check if initial and final values are unique
// 		// let haveUniqueInitialFinal = initial !== final;
// 		// if (!haveUniqueInitialFinal) {
// 		// 	throw new Error('Field Dimension Error: dimension must have unique initial and final values');
// 		// }
// 		// // check if numPoints value is at least 2
// 		// let hasCorrectNumPoints = numPoints >= 2;
// 		// if (!hasCorrectNumPoints) {
// 		// 	throw new Error('Field Dimension Error: dimension must have at least 2 numPoints');
// 		// }
// 	}
	
// 	// All 'extend' methods return a new Dimension object
// 	//// extend a given number of steps in both directions
// 	extend(steps = 1) {
// 		return new Dimension(this.numPoints + 2*steps,
// 									this.initial - steps*this.stepSize,
// 								   this.final + steps*this.stepSize);
// 	}
// 	//// extend a given number of steps before this.initial
// 	extendBackward(steps = 1) {
// 		return new Dimension(this.numPoints + steps,
// 									this.initial - steps*this.stepSize,
// 								   this.final);
// 	}
// 	//// extend a given number of steps after this.final
// 	extendForward(steps = 1) {
// 		return new Dimension(this.numPoints + steps,
// 									this.initial,
// 								   this.final + steps*this.stepSize);
// 	}
// }

class Transformation {
	constructor (
		func,
		{progressMethod = 'multiplyBefore', scale = Array(func().length).fill(1)} = {}
	) {
		// TODO: require 'custom' instead of guessing it? (stricter validation)
		if (func.length - func().length === 1) progressMethod = 'custom';
		
		// TODO: add function validation
		this.func = func;
		this.numDimensions = func().length;
		this.options = {
			// "outputRange": outputRange,
			"progressMethod": progressMethod,
			"scale": scale
		};
		
		// make Transformation immutable
		Object.freeze(this);
	}
	
	getScaledPosition(position) {
		return position.map((component,i) => component*this.options.scale[i]);
	}
	
	getProgressedPosition(position, progress = 1, data) {
		// TODO: validation, position.length === this.numDimensions, progress range [0,1]
		const pos = this.getScaledPosition(position);
		return position.map((component, i) => {
			let progressedComponent;
			switch (this.options.progressMethod) {
				case 'multiplyBefore':
					// f(k*x, k*y, k*z)
					// multiply components by progress, then evaluate
					progressedComponent = this.func(...pos.map(comp => progress*comp))[i];
					break;
				case 'multiplyAfter':
					// k*func(x,y,z)
					// evaluate with position components, then multiply by progress
					progressedComponent = progress*this.func(...pos)[i];
					break;
				case 'custom':
					// multiply by progress as defined by user with extra func argument
					progressedComponent = this.func.call(data, ...pos, progress, data)[i];
					break;
			}
			return progressedComponent + (1-progress)*component;
		});
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
	transformMap(transformations, originalPosition, progress) {
		return Point.clone(this).transform(transformations, originalPosition, progress);
	}
	
	// updates this.position and returns this
	transform(transformations, originalPosition = this.position, progress) {
		// TODO: validation for progress between [0,1]
		this.position = transformations.reduce((position, transformation, transIndex) => {
			if (transIndex > 0) progress = 1;
			return transformation.getProgressedPosition(position, progress, this.data);
		}, originalPosition);
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

class Coordinates {
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
		
		this.componentCurves = this.size.map((numPoints, i, arr) => {
			//////////////////
			if (numPoints === 1) {
				return 0;
			} else {
				return arr.reduce((acc, numPoints, j) => {
					return acc *= (i !== j) ? numPoints : 1;
				}, 1);
			}
		});
		this.numCurves = this.componentCurves.reduce((acc, numComponentCurves) => acc + numComponentCurves, 0);
		
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
		let coordinatesClone = Object.assign(Object.create(Object.getPrototypeOf(self)), self);
		// coordinatesClone.pointsCartesian = coordinatesClone.pointsCartesian.map(point => Point.clone(point));
		coordinatesClone.size = self.size.slice(0);
		coordinatesClone.domain = self.domain.map(el => Object.assign({}, el));
		// coordinatesClone.stepSize = self.stepSize.slice(0);
		coordinatesClone.componentCurves = self.componentCurves.slice(0);
		coordinatesClone.points = coordinatesClone.points.map(point => Point.clone(point));
		coordinatesClone.transformations = coordinatesClone.transformations.slice(0);
		// TODO: add deep clone support for arrays, possibly second-level object literals
		coordinatesClone.data = Object.assign({}, self.data);
		// coordinatesClone.data = Object.assign({},self.data);
		return coordinatesClone;
	}
	
	// iterates points of this.points
	*[Symbol.iterator]() {
		for (let point of this.points) {
			yield point;
		}
	}
	
	// calls transform method on clone of this, returns transformed clone
	transformMap(transformations, progress) {
		return Coordinates.clone(this).transform(transformations, progress);
	}
	
	// transforms this.points and adds transformations to this.transformations array, returns this
	transform(transformations, progress) {
		this.transformations = this.transformations.concat(transformations);
		const transReverse = [...this.transformations].reverse();
		// mutates each Point in this.points array
		for (let i = 0; i < this.numPoints; i++) {
			this.points[i].transform(transReverse, this.positionsCartesian[i], progress);
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
class CoordinatesAnimation {
	constructor(numFrames, coordinates, keyframes) {
		this.numFrames = numFrames;
		this.coordinates = Coordinates.clone(coordinates);
		// TODO: keyframes validation, possibly separate object
		this.keyframes = keyframes;
		// TODO: combine frameSet and frames, using frame object with 'keyframe' property
		this.frameSet = [...Array(keyframes.length-1)];
		// flattened version of frameSet
		this.frames = [];
		
		const startTransformations = this.keyframes[0].transformations;
		let currentCoordinates = (!startTransformations || startTransformations.length === 0)
			? this.coordinates
			: this.coordinates.transform(startTransformations);
		
		// populate this.frameSet and this.frames
		for (let i = 1; i < this.keyframes.length; i++) {
			const keyframePrev = this.keyframes[i-1];
			const keyframe = this.keyframes[i];
			const numFramesInFrameSet = Math.round((keyframe.progress - keyframePrev.progress) / 100 * numFrames);
			const stepInterval = 1/(numFramesInFrameSet-1);
			const framesArr = [...Array(numFramesInFrameSet)].map((_, i) => currentCoordinates.transformMap(keyframe.transformations, i*stepInterval));
			
			this.frameSet[i-1] = framesArr;
			this.frames.push(...framesArr);
			
			if (i !== this.keyframes.length - 1) {
				currentCoordinates = currentCoordinates.transform(keyframe.transformations);
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

// Dimensions
// console.time('dimensions');
// const dim0 = new Dimension(5, 0, scaleY*Math.PI);
// const dim0 = new Dimension(1, 100, 100);
// const dim1 = new Dimension(5, 0, scaleY*Math.PI);
// const dim2 = new Dimension(6, 0, scaleZ*2*Math.PI);
// console.timeEnd('dimensions');

// Transformations
// console.time('transformations');
const terrain = new Transformation(function(x,y,z,step) {
	return [
		step*x + step*25*this.randomVal,
		step*y,
		step*z
	];
});
//// 3D Spherical
const transSpherical = new Transformation((x,y,z) => [
		x*Math.cos(y)*Math.sin(z),
		x*Math.sin(y)*Math.sin(z),
		x*Math.cos(z)
	], {scale: [1, 1/scaleY, 1/scaleZ]}
);
//// 3D experimental
const transTest = new Transformation((r,a,w,step) => [step*r, -step*a/2, step*w/4]);
//// 2D Radial
// const transRadial = new Transformation((x,y,step) => [
// 	step*x*Math.cos(step*y) - step*150,
// 	step*x*Math.sin(step*y) - step*step*70
// ], {scale: [1, 2/scaleY]});
//// 3D Cylindrical
// const transCylindrical = new Transformation((x,y,z) => [x*Math.cos(y), x*Math.sin(y), z], {scale: [1, 2/scaleY, 1]});
// console.timeEnd('transformations');

// Coordinates
// console.time('coordinates');
//// 2D
// let coords = new Coordinates([dim0.extend(),dim1.extend()]);
// let coordsRadial = new Coordinates([dim0.extend(),dim1.extend()], [transRadial]);
//// 3D
const n = 15;
let y_i = 0;
let y_f = scaleY*Math.PI;
let z_i = 0;
let z_f = scaleZ*2*Math.PI;
// const y_step = (y_f - y_i) / (n - 1);
// const z_step = (z_f - z_i) / (n - 1);
// y_i -= y_step;
// y_f += y_step;
// z_i -= z_step;
// z_f += z_step;
let coords = new Coordinates([1,n,n], [
	150,
	[y_i, y_f],
	[z_i, z_f]
]);
// let coords = new Coordinates([20,20,2], [
// 	[-450, 450],
// 	[-1000, 200],
// 	0
// ]);
for (const p of coords) {
	p.data['randomVal'] = Math.random();
}
// let coords = new Coordinates([dim0.extend(),dim1.extend(),dim2.extend()]);
// let coordsCyl = new Coordinates([dim0.extend(),dim1.extend(),dim2.extend()], [transCylindrical]);
// console.timeEnd('coordinates');

// Animation
const numFrames = 300;
// console.time('animation');
// 2D
// let animation = new CoordinatesAnimation(numFrames, coords, [
// 		{progress: 0},
// 		{progress: 100, transformations: [transRadial]}
// 	]
// );
// 3D
let animation = new CoordinatesAnimation(numFrames, coords, [
		{progress: 0, transformations: []},
		{progress: 50, transformations: [transSpherical]},
		{progress: 100, transformations: [terrain]}
	]
);
// let animation = new CoordinatesAnimation(numFrames, coords, [
// 		{progress: 0},
// 		{progress: 100, transformations: [transCylindrical, transTest]}
// 	]
// );
// let animation = new CoordinatesAnimation(numFrames, coords, [
// 		{progress: 0, transformations: [transCylindrical]},
// 		{progress: 100, transformations: [transTest]}
// 	]
// );
// let animation = new CoordinatesAnimation(numFrames, coords.transformMap(transCylindrical), [
// 		{progress: 0},
// 		{progress: 100, transformations: [transTest]}
// 	]
// );
// console.timeEnd('animation');

// let mesh = coords.getCurveMesh();
// console.log(coords.points[0] === mesh[1][0].points[0]);

// Curves
// console.time('curves');
// TODO: add curves as option to CoordinateAnimation constructor?
let animationCurveSet = animation.frames.map(coords => coords.getCurveMesh({"hideOuterCurves": true}));
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
			vertex(...point.position);
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
	// rotateX(frameCount * 0.01);
	// rotateY(frameCount * -0.01);
	// rotateZ(frameCount * -0.04);
	rotateX(1);
	// rotateY(.4);
	rotateZ(.2);
	
	let currentCurveSet = animationCurveSet[animationIndex];
	
	// x-curves
	stroke('orange');
	currentCurveSet[0].forEach(curve => drawCurve(curve));
	// y-curves
	stroke('green');
	currentCurveSet[1].forEach(curve => drawCurve(curve));
	// z-curves
	stroke('purple');
	currentCurveSet[2].forEach(curve => drawCurve(curve));
	
	// all points
	normalMaterial();
	noStroke();
	// fill('purple');
	// for (const p of animation.frames[animationIndex]) {
	// 	push();
	// 	translate(...p.position);
	// 	sphere(5);
	// 	// circle(...p.position,8);
	// 	pop();
	// }
	
	// for (const p of points) {
	// 	push();
	// 	translate(...p.position);
	// 	sphere(10);
	// 	pop();
	// }
	
	rates[animationIndex-1] = frameRate();
	if (animationIndex == framesTotal-1) {
		console.timeEnd('draw');
		const averageFPS = rates.reduce((acc, el) => acc+=el, 0) / rates.length;
		console.log(Math.round(averageFPS) + ' fps');
		noLoop();
	}
}
