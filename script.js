class Transformation {
	constructor(func, {progressMethod = 'multiplyBefore'} = {}) {
		// TODO: require 'custom' instead of guessing it? (stricture validation)
		if (func.length - func().length === 1) progressMethod = 'custom';
		
		// TODO: add function validation
		this.func = func;
		this.numDimensions = this.func.length;
		this.options = {
			// "outputRange": outputRange,
			"progressMethod": progressMethod
		};
		
		// make Transformation immutable
		Object.freeze(this);
	}
	
	getProgressedPosition(position, progress = 1) {
		// TODO: validation, position.length === this.numDimensions, progress range [0,1]
		return position.map((component, i) => {
			let progressedComponent;
			switch (this.options.progressMethod) {
				case 'multiplyBefore':
					// f(k*x, k*y, k*z)
					// multiply components by progress, then evaluate
					progressedComponent = this.func(...position.map(comp => progress*comp))[i];
					break;
				case 'multiplyAfter':
					// k*func(x,y,z)
					// evaluate with position components, then multiply by progress
					progressedComponent = progress*this.func(...position)[i];
					break;
				case 'custom':
					progressedComponent = this.func(...position, progress)[i];
					break;
			}
			return progressedComponent + (1-progress)*component;
		});
	}
}

class Dimension {
	constructor(initial, final, numPoints) {
		// TODO: okay to use arguments param?
		Dimension.validate(...arguments);
		
		this.initial = initial;
		this.final = final; 
		this.numPoints = numPoints;
		this.stepSize = (final - initial) / (numPoints - 1);
		
		// make Dimension immutable
		Object.freeze(this);
	}
	
	// TODO: use static validation method for all classes? (check proper way to pass in arguments - what if something changes and the validation breaks?)
	static validate(initial, final, numPoints) {
		// check if initial and final values are unique
		let haveUniqueInitialFinal = initial !== final;
		if (!haveUniqueInitialFinal) {
			throw new Error('Field Dimension Error: dimension must have unique initial and final values');
		}
		// check if numPoints is an integer value
		let hasIntegerNumPoints = numPoints % 1 === 0;
		if (!hasIntegerNumPoints) {
			throw new Error('Field Dimension Error: dimension must have an integer value for numPoints');
		}
		// check if numPoints value is at least 2
		let hasCorrectNumPoints = numPoints >= 2;
		if (!hasCorrectNumPoints) {
			throw new Error('Field Dimension Error: dimension must have at least 2 numPoints');
		}
	}
	
	// All 'extend' methods return a new Dimension object
	//// extend a given number of steps in both directions
	extend(steps = 1) {
		return new Dimension(this.initial - steps*this.stepSize,
								   this.final + steps*this.stepSize,
								   this.numPoints + 2*steps);
	}
	//// extend a given number of steps before this.initial
	extendBackward(steps = 1) {
		return new Dimension(this.initial - steps*this.stepSize,
								   this.final,
								   this.numPoints + steps);
	}
	//// extend a given number of steps after this.final
	extendForward(steps = 1) {
		return new Dimension(this.initial,
								   this.final + steps*this.stepSize,
								   this.numPoints + steps);
	}
}

class Point {
	constructor(position, dataObject = {}) {
		this.position = position;
		this.data = dataObject;
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
			const func = transformation.func;
			if (transIndex > 0) {
				// last argument needed for 'custom' progressMethod
				return func(...position, 1);
			} else {
				return transformation.getProgressedPosition(position, progress);
			}
		}, originalPosition);
		return this;
	}
}

class Curve {
	// TODO: enable curve creation that isn't tied to Coordinates class (use numDimensions)
	constructor(numPoints, numDimensions, dataObject = {}) {
		this.numPoints = numPoints;
		this.numDimensions = numDimensions;
		this.data = dataObject;
		this.points = [...Array(numPoints)];
		// this.points = Array(numPoints).fill(new Point([...Array(numDimensions)]));
	}
	
	// iterates points of this.points
	*[Symbol.iterator]() {
		for (let point of this.points) {
			yield point;
		}
	}
}

class Coordinates {
	constructor(dimensions, transformations = [], {addControlPoints = false} = {}, dataObject = {}) {
		
		this.dimensions = (addControlPoints) ? dimensions.map(dim => dim.extend()) : dimensions;
		this.numDimensions = this.dimensions.length;
		this.numPoints = this.dimensions.reduce((totalPoints, dim) => totalPoints*dim.numPoints, 1);
		this.numCurves = this.dimensions.reduce((curveAccumulator, _, i) => {
			return curveAccumulator + this.getNumComponentCurves(i);
		}, 0);
		this.size = dimensions.map(dim => dim.numPoints);
		
		const repeatArr = this.dimensions.map((_, i, arr) => {
			return arr.reduce((repeatVal, dimension, dimensionIndex) => {
				return repeatVal *= (dimensionIndex > i) ? dimension.numPoints : 1;
			}, 1);
		});
		
		this.points = [...Array(this.numPoints)].map((_, coordinateIndex) => {
			let coordinateComponents = [...Array(this.numDimensions)];
			let position = [...Array(this.numDimensions)];
			
			// set Point position (Cartesian) and coordinateComponents index for each component based on dimension, repeatArr, and coordinateIndex
			this.dimensions.forEach((dimension, i) => {
				coordinateComponents[i] = Math.floor(coordinateIndex / repeatArr[i]) % dimension.numPoints;
				position[i] = dimension.initial + coordinateComponents[i] * dimension.stepSize;
			})
			
			return new Point(position, {'coordinateComponents': coordinateComponents});
		});
		this.positionsCartesian = this.points.map(point => point.position);
		// console.log(this.points[0].position);
		// this.positions = new Float32Array(this.points.map(point => point.position).flat());
		this.transformations = [];
		// this.transform adds any transformations to this.transformations array
		if (transformations.length !== 0) {
			this.transform(transformations);
		}
		
		// doesn't deep clone
		this.data = Object.assign({}, dataObject);
		
		this.options = {
			"addControlPoints": addControlPoints
		};
	}
	
	static clone(self) {
		let coordinatesClone = Object.assign(Object.create(Object.getPrototypeOf(self)), self);
		// coordinatesClone.pointsCartesian = coordinatesClone.pointsCartesian.map(point => Point.clone(point));
		coordinatesClone.size = self.size.slice(0);
		coordinatesClone.points = coordinatesClone.points.map(point => Point.clone(point));
		coordinatesClone.transformations = coordinatesClone.transformations.slice(0);
		// TODO: add method for deep cloning
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
	
	// loops through this.points
	forEach(callback, thisArg = this) {
		for (let i = 0; i < this.numPoints; i++) {
			// callback.bind(thisArg)(element, index, array)
			callback.bind(thisArg)(this.points[i], i, this.points);
		}
	}
	
	getAnimation(numFrames, transformations) {
		// TODO: require transformations
		const stepInterval = 1/(numFrames-1);
		return [...Array(numFrames)].map((_, i) => this.transformMap(transformations, i*stepInterval));
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
	
	getNumComponentCurves(componentIndex) {
		// TODO: check that componentIndex is in range of this.dimensions [0,this.numDimensions-1]
		// make class property instead of method???
		return this.dimensions.reduce((componentCurveAccumulator,dimension,i) => {
			return componentCurveAccumulator *= (componentIndex !== i) ? dimension.numPoints : 1;
		}, 1);
	}
	
	// TODO: refactor, simplify array creation
	getCurveMesh({hideOuterCurves = false} = {}) {
		const options = {
			"hideOuterCurves": hideOuterCurves
		};
		
		// array of component-based multipliers used to place points into appropriate curve sets
		
		const multipliersArr = this.size.map((_,componentIndex,multsArr) => {
			// remove element of current component, then remove last element, then place 1 at beginning
			let componentMultipliers = multsArr.filter((_,i) => i !== componentIndex);
			componentMultipliers.pop();
			componentMultipliers.unshift(1);
			// multiply each element by all elements preceding it
			componentMultipliers = componentMultipliers.map((_,i,compMultsArr) => {
				let multiplier = compMultsArr[i];
				for (let j = 0; j < i; j++) {
					multiplier *= compMultsArr[j];
				}
				return multiplier
			});
			
			componentMultipliers.splice(componentIndex, 0, -1);
			
			return componentMultipliers;
		});
		
		// array of curve sets for each dimension (x-curveSet, y-curveSet, z-curveSet, ...)
		let curveMesh = this.dimensions.map((dim, dimIndex, dimArr) => {
			// array of curves for each curve set (x-curve_0, x-curve_1, ...)
			return [...Array(this.getNumComponentCurves(dimIndex))].map((_, curveIndex, curveArr) => {
				const multArr = multipliersArr[dimIndex];
				let constantCoordinateComponents = {};
				for (let i = 0; i < multArr.length; i++) {
					if (multArr[i] !== -1) {
						constantCoordinateComponents[i] = (Math.floor(curveIndex / multArr[i]) % curveArr.length) % dimArr[i].numPoints;
					}
				}
				// array of points for each curve (to be filled in below)
				return new Curve(dim.numPoints, this.numDimensions, {'constantCoordinateComponents': constantCoordinateComponents});
				// return [...Array(dim.numPoints)];
			});
		});

		// fill curves with points
		for (const point of this) {
			// point gets added once to each dimension of curve sets (point will be part of n curves, where n = this.numDimensions)
			point.data.coordinateComponents.forEach((coordComponent,i,arr) => {
				// convert point's coordinateComponets to curve set index 
				const curveIndex = arr.reduce((acc,componentVal,j) => {
						const multiplier = multipliersArr[i][j];
						return acc += (multiplier === -1) ? 0 : multiplier*componentVal;
					}
			  	,0);

				curveMesh[i][curveIndex].points[coordComponent] = point;
			});
		}
		
		if (options.hideOuterCurves) {
			curveMesh = curveMesh.map((curveSet) => {
				return curveSet.filter((curve) => {
					let isInnerCurve = true;
					for (let [key, value] of Object.entries(curve.data.constantCoordinateComponents)) {
						if (value === 0 || value === this.dimensions[key].numPoints - 1) {
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
}

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
			const framesArr = currentCoordinates.getAnimation(numFramesInFrameSet, keyframe.transformations);
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

const scaleY = 60;
const scaleZ = 30;
const r = (x,y,z) => (x)*Math.cos(y)*Math.sin(z);
const theta = (x,y,z) => (x)*Math.sin(y)*Math.sin(z);
const phi = (x,y,z) => (x)*Math.cos(z);
const transSpherical = new Transformation((x,y,z,step) => [
	r(step*x,step*y/scaleY,step*z/scaleZ),
	theta(step*x,step*y/scaleY,step*z/scaleZ),
	phi(step*x,step*y/scaleY,step*z/scaleZ)
]);
const transTest = new Transformation((r,a,w,step) => [step*r, -step*a/2, step*w/4]);
const transRadial = new Transformation((x,y,step) => [step*x*Math.cos(2*step*y/scaleY) - step*150, step*x*Math.sin(2*step*y/scaleY) - step*step*70]);
const transCylindrical = new Transformation((x,y,z) => [x*Math.cos(2*y/scaleY), x*Math.sin(2*y/scaleY), z], {progressMethod: 'multiplyBefore'});

const dim0 = new Dimension(0, scaleY*Math.PI, 6);
const dim1 = new Dimension(0, scaleY*Math.PI, 6);
const dim2 = new Dimension(0, scaleZ*2*Math.PI, 6);

// 2D
// let coords = new Coordinates([dim0.extend(),dim1.extend()]);
// let coordsRadial = new Coordinates([dim0.extend(),dim1.extend()], [transRadial]);
// 3D
let coords = new Coordinates([dim0.extend(),dim1.extend(),dim2.extend()]);
let coordsCyl = new Coordinates([dim0.extend(),dim1.extend(),dim2.extend()], [transCylindrical]);
// const xMin = Math.min(...coords.points.map(point => point.position[0]));
// const xMinA = Math.min(...coordsA.points.map(point => point.position[0]));

const numFrames = 150;

//////////
console.time('animation');
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
		{progress: 100, transformations: [transTest]}
	]
);
console.timeEnd('animation');

// clone of this.points array!
// let testIter = [...coords];
// let iterator = coords[Symbol.iterator]();
// console.log(iterator.next());

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
//////////
let animationCurveSet = animation.frames.map(coords => coords.getCurveMesh({"hideOuterCurves": true}));

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
	// rotateX(frameCount * 0.01);
	rotateY(frameCount * -0.03);
	// rotateZ(frameCount * -0.04);
	rotateX(-.2);
	// rotateY(-.4);
	rotateZ(.2);
	
	let currentCurveSet = animationCurveSet[animationIndex];
	
	// x-curves
	stroke('orange');
	currentCurveSet[0].forEach(curve => drawCurve(curve));
	// y-curves
	stroke('green');
	currentCurveSet[1].forEach(curve => drawCurve(curve));
	// // z-curves
	stroke('purple');
	currentCurveSet[2].forEach(curve => drawCurve(curve));
	
	// all points
	// normalMaterial();
// 	noStroke();
// 	fill('purple');
// 	for (const p of animation.frames[animationIndex]) {
// 		push();
// 		// translate(...p.position);
// 		// sphere(5);
// 		circle(...p.position,8);
// 		pop();
// 	}
	
	rates[animationIndex-1] = frameRate();
	if (animationIndex == framesTotal-1) {
		console.timeEnd('draw');
		const averageFPS = rates.reduce((acc, el) => acc+=el, 0) / rates.length;
		console.log(Math.round(averageFPS) + ' fps');
		noLoop();
	}
}
