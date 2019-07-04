class Transformation {
	constructor(func, {progressMethod = (func.toString().includes('this')) ? 'custom' : 'multiplyBefore'} = {}) {
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
	
	getProgressedPosition(position, progress) {
		// TODO: validation, position.length === this.numDimensions, progress range [0,1]
		return position.map((component, i, pos) => {
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
					progressedComponent = this.func.call(progress, ...pos)[i];
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
	// extend a given number of steps in both directions
	extend(steps = 1) {
		return new Dimension(this.initial - steps*this.stepSize,
								   this.final + steps*this.stepSize,
								   this.numPoints + 2*steps);
	}
	// extend a given number of steps before this.initial
	extendBackward(steps = 1) {
		return new Dimension(this.initial - steps*this.stepSize,
								   this.final,
								   this.numPoints + steps);
	}
	// extend a given number of steps after this.final
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
	
	// updates this.position and returns Point
	transform(transformations, originalPosition = this.position, progress = 1) {
		// TODO: validation for progress between [0,1]
		this.position = transformations.reduce((position, transformation, transIndex, arr) => {
			const func = transformation.func;
			if (transIndex > 0 || progress === 1) {
				return func(...position);
			} else {
				return transformation.getProgressedPosition(position, progress);
			}
		}, originalPosition);
		return this;
	}
}

class Curve {
	constructor(numPoints, numDimensions, dataObject = {}) {
		this.numPoints = numPoints;
		this.numDimensions = numDimensions;
		this.data = dataObject;
		this.points = [...Array(numPoints)];
	}
	
	// *[Symbol.iterator]() {
	// 	for (let point of this.points) {
	// 		yield point;
	// 	}
	// }
	
	*[Symbol.iterator]() {
		let i = 0;
		while(i < this.flatPoints.length) {
			const startIndex = this.numDimensions*i;
			yield this.flatPoints.slice(startIndex, startIndex + this.numDimensions);
			i++;
		}
	}
	
	addFlatPoints() {
		let arr = [];
		for (let i = 0; i < this.numPoints; i++) {
			arr.push(...this.points[i].position);
		}
		this.flatPoints = new Float32Array(arr);
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
	
	*[Symbol.iterator]() {
		for (let point of this.points) {
			yield point;
		}
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
		let transReverse = [...this.transformations].reverse();
		// mutates each Point in this.points array
		this.forEach((point,i)  => {
			point.transform(transReverse, this.positionsCartesian[i], progress);
		 });
		return this;
	}
	
	getNumComponentCurves(componentIndex) {
		// TO DO: check that componentIndex is in range of this.dimensions [0,this.numDimensions-1]
		// make class property instead of method???
		return this.dimensions.reduce((componentCurveAccumulator,dimension,i) => {
			return componentCurveAccumulator *= (componentIndex !== i) ? dimension.numPoints : 1;
		}, 1);
	}
	
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
			return componentMultipliers;
		});
		// console.log(multipliersArr);
		
		const multipliersArrNew = this.size.map((_,componentIndex,multsArr) => {
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
		// console.log(multipliersArrNew);
		
		// array of curve sets for each dimension (x-curveSet, y-curveSet, z-curveSet, ...)
		let curveMesh = this.dimensions.map((dim, dimIndex, dimArr) => {
			// array of curves for each curve set (x-curve_0, x-curve_1, ...)
			return [...Array(this.getNumComponentCurves(dimIndex))].map((_, curveIndex, curveArr) => {
				const multArr = multipliersArrNew[dimIndex];
				let constantCoordinateComponents = {};
				for (let i = 0; i < multArr.length; i++) {
					if (multArr[i] >= 0) {
						// console.log(curveIndex + ' | ' + curveArr.length + ' | ' + multArr[i] + ' | ' + dimArr[i].numPoints + ' || ' + i + ' | ' + dimArr.map(dim => dim.numPoints) + ' | ' + dimArr[i].numPoints);
						constantCoordinateComponents[i] = (Math.floor(curveIndex / multArr[i]) % curveArr.length) % dimArr[i].numPoints;
					}
				}
				// array of points for each curve (to be filled in below)
				return new Curve(dim.numPoints, this.numDimensions, {'constantCoordinateComponents': constantCoordinateComponents});
				// return [...Array(dim.numPoints)];
			});
		});

		// fill curves with points
		this.forEach(point => {
			// point gets added once to each dimension of curve sets (point will be part of n curves, where n = this.numDimensions)
			point.data.coordinateComponents.forEach((coordComponent,i,arr) => {
				
				// convert point's coordinateComponets to curve set index 
				const curveIndex = arr.filter((_,j) => i !== j)
					.reduce((acc,componentVal,j) => {
						return acc += multipliersArr[i][j]*componentVal;
					}
			  	,0);
				const pointIndex = coordComponent;
				// console.log(arr + ' | ' + i + ' | ' + curveIndex + ' | ' + pointIndex);

				curveMesh[i][curveIndex].points[pointIndex] = point;
			});
		})
		
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
		this.keyframes = keyframes;
		this.frameSet = [...Array(keyframes.length-1)];
		// flattened version of frameSet
		this.frames = [];
		
		const startTransformations = this.keyframes[0].transformations;
		let currentCoordinates = (!startTransformations || startTransformations.length === 0)
			? this.coordinates
			: this.coordinates.transform(this.keyframes[0].transformations);
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
		
		// this.components = new Float32Array(this.frames.length*this.coordinates.numPoints*this.coordinates.numDimensions);
// 		for (let i = 0; i < this.frames.length; i++) {
// 			const frame = this.frames[i];
// 			for (let j = 0; j < frame.numPoints; j++) {
// 				const point = frame.points[j];
// 				for (let k = 0; k < frame.numDimensions; k++) {
					
// 				}
// 			}
// 		}
		let arr = [];
		this.frames.forEach(coords => {
			for (const point of coords) {
				for (const component of point) {
					arr.push(component);
				}
			}
		});
		this.components = new Float32Array(arr);
	}
	
	*getPos(frameIndex) {
		const posLength = this.coordinates.numDimensions;
		const frameLength = this.coordinates.numPoints * posLength;
		const frameStart = frameIndex*frameLength;
		let i = 0
		while(i < frameLength) {
			const sliceStart = i*posLength + frameStart;
			// yield TypedArray object that points to same memory locations as those selected from this.components
			// NOTE: changing this array will change the same values in this.components, and visa versa
			yield this.components.subarray(sliceStart, sliceStart + posLength);
			i += posLength;
		}
	}
	
	*[Symbol.iterator]() {
		for (let frame of this.frames) {
			yield frame;
		}
	}
}

const scaleY = 60;
const scaleZ = 30;
const r = (x,y,z) => x*Math.cos(y)*Math.sin(z);
const theta = (x,y,z) => x*Math.sin(y)*Math.sin(z);
const phi = (x,y,z) => x*Math.cos(z);
const transSpherical = new Transformation((x,y,z) => [r(x,y/scaleY,z/scaleZ), theta(x,y/scaleY,z/scaleZ), phi(x,y/scaleY,z/scaleZ)], {progressMethod: 'multiplyBefore'});

const transCylindrical = new Transformation((x,y,z) => [x*Math.cos(2*y/scaleY), x*Math.sin(2*y/scaleY), z], {progressMethod: 'multiplyBefore'});

const dim0 = new Dimension(0, 60*Math.PI, 15);
const dim1 = new Dimension(0, scaleY*Math.PI, 15);
const dim2 = new Dimension(0, scaleZ*2*Math.PI, 15);

let coords = new Coordinates([dim0.extend(),dim1.extend(),dim2.extend()]);
// const keys = Object.keys(coords);
// for (let i = 0; i < keys.length; i++) {
// 	const prop = keys[i];
// 	if (coords[prop] instanceof Array) {console.log(prop)};
// }
let coordsCyl = new Coordinates([dim0.extend(),dim1.extend(),dim2.extend()], [transCylindrical]);
// const xMin = Math.min(...coords.points.map(point => point.position[0]));
// const xMinA = Math.min(...coordsA.points.map(point => point.position[0]));
let testPoint = new Point([10,10,0]);
const T1 = new Transformation((x,y,z) => [x-100,y+100,z]);
const T2 = new Transformation((x,y,z) => [2*x,y/2,z]);
// T2(...T1(...))
console.log('-----');
console.time('pointTransform');
let testPointT_A = testPoint.transformMap([T1,T2]);
let testPointT_B = testPoint.transformMap([T1]).transform([T2]);
console.timeEnd('pointTransform');

const transTest = new Transformation((r,a,w) => [r/2, a, 0], {progressMethod: 'multiplyBefore'});
const numFrames = 100;
let animationSet = coordsCyl.getAnimation(numFrames, [transTest]);

//////////
console.time('animation');
let animation = new CoordinatesAnimation(numFrames, coords, [
		{progress: 0, transformations: []},
		{progress: 75, transformations: [transCylindrical]},
		{progress: 100, transformations: [transTest]}
	]
);
console.timeEnd('animation');
// for (let i = 0; i < animation.frames.length; i++) {
// 	for (const val of animation.getPos(i)) {
// 		console.log(val);
// 	}
// }
// console.log(animation);
// for (let point of coords) {
// 	console.log(point instanceOf Point);
// }
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

// for (const frame of animationCurveSet) {
// 	for (const curveSet of frame) {
// 		for (let i = 0; i < curveSet.length; i++) {
// 			curveSet[i].addFlatPoints();
// 		}
// 	}
// }

const fps = 60;
let rates = [...Array(numFrames-1)];
let drawCurve;
/// P5JS ///
function setup() {
	frameRate(fps);  //default value is 60
	canvas = createCanvas(700, 550, WEBGL);
	//set origin to center of canvas
	// canvas.translate(width/2, height/2);
	// NOTE: +y points downwards
	drawCurve = (curve) => {
		noFill();
		beginShape();
		// for (const point of curve) {
		// 	curveVertex(...point.position);
		// }
		// for (let i = 0; i < curve.points.length; i++) {
		// 	curveVertex(...curve.points[i].position);
		// }
		for (const pos of curve) {
			curveVertex(...pos);
		}
		endShape();
	};
 	// noLoop();
}

function draw() {
	if (frameCount == 1) console.time('draw');
	
	const framesTotal = animationSet.length;
	const frameRepeat = 1;
	const frame = Math.floor(frameCount / frameRepeat);
	let animationIndex = frame % framesTotal;
	if ((frame % (2*framesTotal)) > (framesTotal-1)) {
		animationIndex = Math.abs((framesTotal-1) - animationIndex);
	}

	colorMode(HSB);
	// background(...animationSet[animationIndex].data.color);
	background('#fafafa');
	// rotateX(frameCount * 0.01);
	rotateY(frameCount * -0.01);
	// rotateZ(frameCount * -0.04);
	rotateX(-.1);
	// rotateY(-.4);
	rotateZ(.2);
	
	let currentCurveSet = animationCurveSet[animationIndex];
	
	// // x-curves
	// stroke('orange');
	// currentCurveSet[0].forEach(curve => drawCurve(curve));
	// // y-curves
	// stroke('green');
	// currentCurveSet[1].forEach(curve => drawCurve(curve));
	// // z-curves
	// stroke('purple');
	// currentCurveSet[2].forEach(curve => drawCurve(curve));
	
	// push();
	// fill('red');
	// stroke('black');
	// translate(...testPoint.position);
	// sphere(40);
	// pop();
	// push();
	// fill('yellow');
	// translate(...testPointT_A.position);
	// sphere(40);
	// pop();
	// push();
	// stroke('blue');
	// translate(...testPointT_B.position);
	// sphere(40);
	// pop();
	
	// all points
	stroke('#ddd');
	// for (const p of animation.frames[animationIndex]) {
	// 	push();
	// 	stroke('purple');
	// 	translate(...p.position);
	// 	point();
	// 	pop();
	// }
	
	for (const p of animation.getPos(animationIndex)) {
		push();
		stroke('purple');
		translate(...p);
		point();
		pop();
	}
	
	rates[animationIndex-1] = frameRate();
	if (animationIndex == framesTotal-1) {
		console.timeEnd('draw');
		console.log(rates.reduce((acc, el) => acc+=el, 0)/rates.length);
		noLoop();
	}
}
