class Transformation {
	constructor (
		func,
		{progressMethod = (func.length > 0) ? 'custom' : 'multiplyBefore', scale = null} = {}
	) {
		// TODO: require 'custom' instead of guessing it? (stricter validation)
		// TODO: add function validation
		this.func = func;
		this.numDimensions = func().length;
			
		this.options = {
			"progressMethod": progressMethod,
			"scale": scale
			// scaleInput, scaleOutput, inputRange, outputRange
		};
		
		// make Transformation immutable
		Object.freeze(this);
	}
	
	static funcComponentIdentity(numDimensions, dimensionIndex, returnVal) {
		const argumentArr = [...Array(numDimensions)].map((_, i) => `x${i}`);
		if (!returnVal && returnVal !== '') {
			returnVal = argumentArr[dimensionIndex];
		}
		return new Function(argumentArr, `return ${returnVal}`);
	}
	
	static identity(numDimensions, componentKeyPairs) {
		// collapseMap.length <= numDimensions with each key < numDimensions
		if (!(componentKeyPairs instanceof Map)) componentKeyPairs = new Map(componentKeyPairs);
		const returnArr = [...Array(numDimensions)].map((_,i) => {
			return Transformation.funcComponentIdentity(numDimensions, i, componentKeyPairs.get(i));
		});
		return new Transformation(
			new Function([], `return [${returnArr}]`),
			{progressMethod: 'multiplyAfter'}
		);
	}
	
	calcFunc(position, progress) {
		return this.func(progress).map(funcComponent => funcComponent(...position));
	}
	
	scale(position) {
		return position.map((component,i) => component*this.options.scale[i]);
	}
	
	progress(position, progress, point = new Point(position), thisArg) {
		let newPos;
		switch (this.options.progressMethod) {
			case 'multiplyBefore':
				// f(k*x, k*y, k*z)
				// multiply components by progress, then evaluate
				newPos = this.calcFunc(position.map(comp => progress*comp));
				break;
			case 'multiplyAfter':
				// k*func(x,y,z)
				// evaluate with position components, then multiply by progress
				newPos = this.calcFunc(position).map(comp => progress*comp);
				break;
			case 'custom':
				// multiply by progress as defined by user with extra func argument
				newPos = this.calcFunc(position, progress);
				break;
		}
		// point.position is used because the mapping requires the original, unscaled position provided (only relevant if progress() called via transform())
		return point.position.map((component,i) => newPos[i] + (1-progress)*component);
	}
	
	transform(position, progress = 1, point = new Point(position), thisArg) {
		// scale position if scaling option exists
		let newPos = (this.options.scale) ? this.scale(position) : position;
		// when progress = 1, 'multiplyBefore' and 'multiplyAfter' calculations reduce to this.calcFunc(), so perform that operation when possible to avoid unnecessary call to this.progress()
		if (progress === 1 && this.options.progressMethod !== 'custom') {
			return this.calcFunc(newPos, progress);
		}
		return this.progress(newPos, progress, point, thisArg);
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
	
	// getters
	get numDimensions() {
		return this.position.length;
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
			return transformation.transform(position, progress, this, thisArg);
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

class Dimension {
	constructor(size, initial, final = initial) {
		// TODO: okay to use arguments param?
		Dimension.validate(...arguments);

		this.size = size;
		this.initial = initial;
		this.final = final
		
		this.stepSize = (this.size !== 1) ? (this.final - this.initial) / (this.size - 1) : 0;
		this.components = [...Array(this.size)].map((_, i) => this.initial + i*this.stepSize);
		
		// make Dimension immutable
		Object.freeze(this);
	}

	// TODO: use static validation method for all classes? (check proper way to pass in arguments - what if something changes and the validation breaks?)
	static validate(size, initial, final) {
		// check if numPoints is an integer value
		let hasIntegerSize = size % 1 === 0;
		if (!hasIntegerSize) {
			throw new Error('Dimension Error: size must be an integer value');
		}
	}
	
	// All 'extend' methods return a new Dimension object
	//// extend a given number of steps in both directions
	extend(steps = 1) {
		return new Dimension(this.size + 2*steps,
									this.initial - steps*this.stepSize,
								   this.final + steps*this.stepSize);
	}
	//// extend a given number of steps before this.initial
	extendBackward(steps = 1) {
		return new Dimension(this.size + steps,
									this.initial - steps*this.stepSize,
								   this.final);
	}
	//// extend a given number of steps after this.final
	extendForward(steps = 1) {
		return new Dimension(this.size + steps,
									this.initial,
								   this.final + steps*this.stepSize);
	}
}

class Space {
	constructor(...dimensions) {
		this.dimensions = dimensions.map(dim => {
			if (dim instanceof Dimension) {
				return dim; 
			} else if (dim instanceof Array) {
				return new Dimension(...dim);
			} else {
				throw new Error('Space Error: arguments must be either Dimension or Array objects');
			}
		});
		
		this.numDimensions = this.dimensions.length;
		this.size = this.dimensions.map(dim => dim.size);
		this.numPoints = this.size.reduce((acc, n) => acc * n, 1);
		this.repeatArr = this.size.map((_, i, arr) => {
			return arr.reduce((repeatVal, n, j) => {
				return repeatVal *= (j > i) ? n : 1;
			}, 1);
		});
		
		this.stepIndicesArr = new Float32Array(this.numPoints*this.numDimensions);
		for (let i = 0; i < this.numPoints; i++) {
			for (let j = 0; j < this.numDimensions; j++) {
				this.stepIndicesArr[this.getFlatIndex(i,j)] = Math.floor(i / this.repeatArr[j]) % this.dimensions[j].size;
			}
		}
	}
	
	getFlatIndex(pointIndex, dimensionIndex) {
		if (pointIndex < 0 || pointIndex >= this.numPoints) {
			throw new Error('Space Error: pointIndex out of range');
		}
		if (dimensionIndex < 0 || dimensionIndex >= this.numDimensions) {
			throw new Error('Space Error: dimensionIndex out of range');
		}
		return pointIndex*this.numDimensions + dimensionIndex;
	}
	getPointIndex(flatIndex) {
		if (flatIndex < 0 || flatIndex >= this.numPoints*this.numDimensions) {
			throw new Error('Space Error: flatIndex out of range');
		}
		return flatIndex % this.numDimensions;
	}
	getDimensionIndex(flatIndex) {
		if (flatIndex < 0 || flatIndex >= this.numPoints*this.numDimensions) {
			throw new Error('Space Error: flatIndex out of range');
		}
		return Math.floor(flatIndex / this.numDimensions);
	}
	
// 	indexFromComps(comps) {
// 		// comps.length === this.numDimensions
// 		return comps.reduce((acc, comp, i) => acc + comp * this.repeatArr[i], 0);
// 	}
// 	indexFromPos(pos) {
// 		// pos.length === this.numDimensions
// 		return this.indexFromComps(this.dimensions.map((dim, i) => dim.getIndex(pos[i])));
// 	}
	
	getStepIndex(pointIndex, dimensionIndex) {
		return this.stepIndicesArr[this.getFlatIndex(pointIndex, dimensionIndex)];
	}
	getStepIndices(pointIndex) {
		if (pointIndex < 0 || pointIndex >= this.numPoints) {
			throw new Error('Space Error: pointIndex out of range');
		}
		return this.dimensions.map((_, i) => this.getStepIndex(pointIndex, i));
	}
	getPositionComponent(pointIndex, dimensionIndex) {
		return this.dimensions[dimensionIndex].components[this.getStepIndex(pointIndex, dimensionIndex)];
	}
	getPosition(pointIndex) {
		if (pointIndex < 0 || pointIndex >= this.numPoints) {
			throw new Error('Space Error: pointIndex out of range');
		}
		return this.dimensions.map((_, i) => this.getPositionComponent(pointIndex, i));
	}
}

class Field {
	constructor(space, {transformations = [], data = {}} = {}) {
		if (space instanceof Space) {
			this.space = space;
		} else if (space instanceof Array) {
			this.space = new Space(...space);
		} else {
			throw new Error('Field Error: first argument must be either Space or Array object');
		}
		
		this.points = [...Array(this.numPoints)].map((_, i) => new Point(this.space.getPosition(i), {'fieldIndex': i}));

		this.data = data;
		this.transformations = [];
		// this.transform adds any transformations to this.transformations array
		if (transformations.length > 0) {
			this.transform(transformations);
		}
	}
	
	static clone(self) {
		let fieldClone = Object.assign(Object.create(Object.getPrototypeOf(self)), self);
		fieldClone.points = fieldClone.points.map(point => Point.clone(point));
		fieldClone.transformations = fieldClone.transformations.slice(0);
		// TODO: add deep clone support for arrays, possibly second-level object literals
		fieldClone.data = Object.assign({}, self.data);
		return fieldClone;
	}
	
	// iterates points of this.points
	*[Symbol.iterator]() {
		for (const point of this.points) {
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
	
	// Space getters
	get dimensions() {return this.space.dimensions}
	get numDimensions() {return this.space.numDimensions}
	get size() {return this.space.size}
	get numPoints() {return this.space.numPoints}
	// get repeatArr() {return this.space.repeatArr}
	// get positionsCartesian() {return this.space.positionsCartesian}
	// get componentIndices() {return this.space.componentIndices}
	
	transformationIdentity() {
		return Transformation.identity(this.numDimensions);
	}
	transformationCollapse(componentKeyPairs) {
		return Transformation.identity(this.numDimensions, componentKeyPairs);
	}
	
	collapse(componentKeyPairs, progress) {
	// collapse(dimensionIndex, constantComponent) {
	// 	for (let i = 0; i < this.numPoints; i++) {
	// 		const compIndices = this.componentIndices[i];
	// 		if (compIndices[dimensionIndex] !== constantComponent) {
	// 			const index = this.compsToIndex(compIndices.map((compIndex, j) => (j === dimensionIndex ? constantComponent : compIndex)));
	// 			this.points[i].position = [...this.points[index].position];
	// 		}
	// 	}
	// 	return this;
		return this.transform(this.transformationCollapse(componentKeyPairs), progress);
	}
	
	collapseMap(componentKeyPairs, progress) {
		return Field.clone(this).collapse(componentKeyPairs, progress);
	}

// 	extrude() 
	
	// transforms this.points and adds transformations to this.transformations array, returns this
	transform(transformations, progress, thisArg = this) {
		this.transformations = this.transformations.concat(transformations);
		const transReverse = [...this.transformations].reverse();
		// mutates each Point in this.points array
		for (let i = 0; i < this.numPoints; i++) {
			const point = this.points[i];
			point.position = this.space.getPosition(i);
			point.transform(transReverse, progress, thisArg);
		}
		return this;
	}
		
	// calls transform method on clone of this, returns transformed clone
	transformMap(transformations, progress, thisArg) {
		return Field.clone(this).transform(transformations, progress, thisArg);
	}
	
	getCurveMesh({hideOuterCurves = false} = {}) {
		const options = {
			"hideOuterCurves": hideOuterCurves
		};
		
		const dimensionless = this.size.map(numPoints => numPoints === 1);
		// TODO: add methods to retrieve curve properties from points and vice versa
		// array of component-based multiplier arrays used to place points into appropriate curve sets
		const curveMultipliers = this.size.map((_, dimensionIndex, size) => {
			//////////////////
			if (dimensionless[dimensionIndex]) {return null};
			
			// remove element of current component, then remove last element
			let multipliers = size.filter((_,i) => i !== dimensionIndex);
			multipliers.pop();
			// multiply each element by all elements preceding it
			for (let i = 1; i < multipliers.length; i++) {
				multipliers[i] *= multipliers[i-1];
			}
			// place 1 at beginning of array, then add value of 0 at index of current component
			multipliers.unshift(1);
			multipliers.splice(dimensionIndex, 0, 0);
			
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
		for (let i = 0; i < this.numPoints; i++) {
			const point = this.points[i];
			// point gets added once to each dimension of curve sets
			//// point will be part of n curves, where n = this.numDimensions = point.data.fieldComponents.length
			this.space.getStepIndices(i).forEach((dimensionIndex, j, arr) => {
				//////////////////
				if (dimensionless[j]) return;
				// convert point's fieldComponets to curve set index 
				const curveIndex = arr.reduce((acc, componentVal, k) => {
						let multiplier = curveMultipliers[j][k];
						if (!multiplier) multiplier = 0;
						return acc += multiplier*componentVal;
					}
			  	,0);

				curveMesh[j][curveIndex].points[dimensionIndex] = point;
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
	
	getAnimation(numFrames, keyframes) {
		return new FieldAnimation(this, numFrames, keyframes);
	}
	// getPoints(...constantComponents) {
	// 	const map = new Map(constantComponents);
	// 	let arr = [];
	// 	for (const [point, i] of this) {
	// 		let match = true;
	// 		for (const [key, value] of map) {
	// 			if (this.componentIndices[i][key] !== value) {
	// 				match = false;
	// 			}
	// 		}
	// 		if (match) arr.push(point);
	// 	}
	// 	return arr;
	// }
}

// TODO: add render method?
class FieldAnimation {
	constructor(field, numFrames, keyframes) {
		this.field = Field.clone(field);
		this.numFrames = numFrames;
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

console.log('-------');

// scale factors
const scaleY = 60;
const scaleZ = 30;

let scaleFunc = (val, a_i, a_f, b_i, b_f) => {
	return (val - a_i)*(b_f - b_i)/(a_f - a_i) + b_i;
}

// Transformations
// console.time('transformations');
// const terrain = new Transformation((step) => [
// 	(x,y,z) => step*x + step*50*this.data.randomVal,
// 	(x,y,z) => step*y,
// 	(x,y,z) => step*z
// ]);
//// 3D Spherical
const transSpherical = new Transformation(() => [
	(x,y,z) => x*Math.cos(y)*Math.sin(z),
	(x,y,z) => x*Math.sin(y)*Math.sin(z),
	(x,y,z) => x*Math.cos(z)
], {scale: [1, 1/scaleY, 1/scaleZ]});

// const wavy = new Transformation((x,y,z,step) => [
// 		step*x + step*(y+z)*Math.sin(step*2*Math.PI),
// 		step*y + step*(x+z)*Math.sin(step*2*Math.PI),
// 		step*z + step*(x+y)*Math.sin(step*2*Math.PI)
// 	]
// );
//// 2D Radial
const xFunc = (s) => (x,y) => s*x*Math.cos(s*y);
const yFunc = (s) => (x,y) => s*x*Math.sin(s*y);
const transRadial = new Transformation(step =>
	[xFunc(step), yFunc(step)],
	{scale: [1, 1/25]}
);
const transWavy = new Transformation(() => [
	(r,theta) => r + (10+r/30)*Math.cos(theta/Math.PI),
	(r,theta) => theta + r/200*Math.PI*10
]);
//// 3D Cylindrical
// const transCylindrical = new Transformation((x,y,z) => [x*Math.cos(y), x*Math.sin(y), z], {scale: [1, 2/scaleY, 1]});
// console.timeEnd('transformations');

// Field
const dimR = new Dimension(5, 0, 200);
const dimTheta = new Dimension(10, 0, 25*2*Math.PI);
const dimB = new Dimension(8, -200, 200);
const dimC = new Dimension(3, -100, 100);
console.time('field');
// let space3D = new Space(dimX.extend(), dimY.extend(), dimZ.extend());
// let field3D = new Field([dimB.extend(), dimB.extend(), dimC.extend()]);
let field3D = new Field([
	new Dimension(5, 0, 200).extend(),
	new Dimension(8, 0, scaleY*Math.PI).extend(),
	new Dimension(10, 0, scaleZ*2*Math.PI).extend()
]);
console.timeEnd('field');
let field2D = new Field([
	dimR.extend(),
	dimTheta.extend()
]);


let testT = new Transformation(step => [
	(x,y,z) => step*x,
	(x,y,z) => step*y + step*100*Math.sin(step*x/(20*Math.PI)),
	(x,y,z) => step*z
]);
						

// let t = new Transformation(step => [
// 	(x,y,z) => step*x,
// 	(x,y,z) => step*y,
// 	(x,y,z) => step*z + step*20*Math.cos(step*x/10)*Math.cos(step*y/10)
// ]);
// field2D.transform(transRadial).transform(transWavy);
// field2D.transform([transRadial,transWavy]);

// field2D.transform(([x,y], step, field) => [
// 	step*x*Math.cos(step*y),
// 	step*x*Math.sin(step*y)
// ], {scale: [1, 1/25]}));

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
const numFrames = 200;
// console.time('animation');
let animation2D = field2D.getAnimation(numFrames, [
		{progress: 0},
		{progress: 50, transformations: [transRadial]},
		{progress: 100, transformations: [transWavy]}
	]
);
let animation3D = field3D.getAnimation(numFrames, [
		{progress: 0},
		{progress: 50, transformations: [transSpherical]},
		{progress: 75, transformations: [field3D.transformationCollapse([[0,150]])]},
		{progress: 100, transformations: [field3D.transformationCollapse([[1,150]])]}
		// {progress: 100, transformations: [field3D.transformationCollapse([[2,Math.PI*scaleZ/2]])]}
	]
);
// console.timeEnd('animation');

// Curves
// console.time('curves');
let animationCurveSet2D = animation2D.frames.map(field => field.getCurveMesh({"hideOuterCurves": true}));
let animationCurveSet3D = animation3D.frames.map(field => field.getCurveMesh({"hideOuterCurves": true}));
// let mesh = field3D.getCurveMesh({"hideOuterCurves": true});
// console.timeEnd('curves');

const fps = 60;
const framesTotal = numFrames;
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
	rotateX(1);
	// rotateY(frameCount * -0.01);
	rotateZ(frameCount * -0.01);
	// rotateX(Math.PI/2 - frameCount*.0015);
	// rotateZ(-frameCount*.001);
	// rotateY(.4);
	// rotateZ(.2);
	
	let currentCurveSet2D = animationCurveSet2D[animationIndex];
	let currentCurveSet3D = animationCurveSet3D[animationIndex];
	
	// // x-curves
	stroke('orange');
	// mesh[0].forEach(curve => drawCurve(curve));
	// currentCurveSet2D[0].forEach(curve => drawCurve(curve));
	currentCurveSet3D[0].forEach(curve => drawCurve(curve));
	// // y-curves
	stroke('green');
	// mesh[1].forEach(curve => drawCurve(curve));
	// currentCurveSet2D[1].forEach(curve => drawCurve(curve));
	currentCurveSet3D[1].forEach(curve => drawCurve(curve));
	// z-curves
	stroke('purple');
	// mesh[2].forEach(curve => drawCurve(curve));
	currentCurveSet3D[2].forEach(curve => drawCurve(curve));
	
	
	// // all points
	// normalMaterial();
	// noStroke();
	// // fill('purple');
	// for (const p of field3D) {
	// 	push();
	// 	translate(...p.position);
	// 	sphere(5);
	// 	// circle(...p.position,8);
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
