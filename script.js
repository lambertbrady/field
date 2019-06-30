class Transformation {
	constructor(func, {stepFunction = (func.toString().includes('this')) ? 'custom' : 'multiplyBefore'} = {}) {
		this.func = func;
		this.numDimensions = this.func.length;
		this.options = {
			// "outputRange": outputRange,
			"stepFunction": stepFunction
		};
		// this.hasCustomStepFunc = this.func.toString().includes('this');
	}
	
	static clone(self) {
		// TODO: deep clone
		return new Transformation(self.func, self.options);
	}
}

class Field {
	
	constructor(...transformations) {
		// check if arguments are Transformation objects
		const areTransformations = transformations.every(trans => trans.constructor.name === 'Transformation');
		if (!areTransformations) {
			throw new Error('Field Error: all arguments must be Transformation objects');
		}
		// check if all transformation numDimensions are equal
		const areEqualDimensions = transformations.every((trans,_,arr) => trans.numDimensions === arr[0].numDimensions);
		if (!areEqualDimensions) {
			throw new Error('Field Error: all Transformations provided must have equal numDimensions');
		}
								 
		this.transformations = transformations.slice(0);
		// currently require that all transformations have same func length
		this.numDimensions = transformations[0].numDimensions;
		// // maximum transformation dimension
		// this.numDimensions = transformations.reduce((max, trans) => {
		// 	return (trans.numDimensions > max) ? trans.numDimensions : max;
		// }, 0);
	}
	
	/// VALIDATION METHODS ///
	validateTransformation(transformation) {
		// check if second argument is a function with the number of arguments equal to numDimensions
		transformation.forEach(transform => {
			let transformDimension = transform[0];
			let transformFunction = transform[1];
			
			// check if dimensions are integers within range: [0, numDimensions - 1]
			let dimensionMax = this.numDimensions - 1;
			let hasValidDimension =  transformDimension >= 0 && transformDimension <= dimensionMax && transformDimension % 1 === 0;
			if (!hasValidDimension) {
				throw new Error('Field Transformation Error: dimension must be an integer between 0 and ' + dimensionMax);
			}
			
			// check if function is correct type and has the same number of arguments as there are dimensions (this.numDimensions)
			let hasValidFunction = typeof transformFunction === 'function' && transformFunction.length === this.numDimensions;
			if (!hasValidFunction) {
				throw new Error('Field Transformation Error: transformation functions must be of type "function" where the number of arguments is equal to this.numDimensions')
			}
		});
		
		// check if duplicate dimensions are included
		let dimensionArray = transformation.map(transform => transform[0]);
		let dimensionSet = new Set(dimensionArray);
		let hasDuplicateDimensions = dimensionArray.length !== dimensionSet.numPoints;
		if (hasDuplicateDimensions) {
			throw new Error('Field Transformation Error: transformation dimensions must be unique');	
		}
	}
	validateTargetIndex(targetIndex) {
		// check if targetIndex is an integer within range: [0, transformations.length - 1]
		let indexMax = this.transformations.length - 1;
		let hasValidIndex =  targetIndex >= 0 && targetIndex <= indexMax && targetIndex % 1 === 0;
			if (!hasValidIndex) {
				throw new Error('Field Transformation Error: targetIndex must be an integer between 0 and ' + indexMax);
			}
	}
	
	/// END VALIDATION METHODS ///
	
	/// METHODS ///
	
	getCoordinates(dimensions, targetIndex = this.transformations.length, optionsObject) {
		const transformations = this.transformations.slice(0, targetIndex);
		return new Coordinates(dimensions, transformations, optionsObject);
	}
	
	getCoordinateSpace(...dimensions) {
		return new CoordinateSpace(this, ...dimensions);
	}
	
	/// END METHODS ///
}

class Dimension {
	constructor(initial, final, numPoints) {
		// TODO: okay to use arguments param?
		Dimension.validate(...arguments);
		
		this.initial = initial;
		this.final = final; 
		this.numPoints = numPoints;
		
		this.stepSize = (this.final - this.initial) / (this.numPoints - 1);
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
	constructor(positionVector, dataObject = {}) {
		// this.positionCartesian = positionVector.slice(0);
		this.position = positionVector.slice(0);
		
		this.data = dataObject;
	}
	
	*[Symbol.iterator]() {
		for (let position of this.position) {
			yield position;
		}
	}
	
	static clone(self) {
		let pointClone = Object.assign(Object.create(Object.getPrototypeOf(self)), self);
		// pointClone.positionCartesian = self.positionCartesian.slice(0);
		pointClone.position = self.position.slice(0);
		pointClone.data = JSON.parse(JSON.stringify(self.data));
		return pointClone;
	}
	
	// static compose(transformations, originalPosition, thisArg) {
	compose(transformations, originalPosition = this.position, progress = 1, stepStartIndex) {
		return transformations.reduce((position, transformation, transIndex, arr) => {
			// reverse index order
			transIndex = arr.length - transIndex - 1;
			const func = transformation.func;
			if (progress === 1 || transIndex < stepStartIndex) {
				return func(...position);
			} else {
				return position.map((_, i) => {
					let transformedComponent;
					switch (transformation.options.stepFunction) {
					// multiply by progress before or after func is applied
						case 'multiplyBefore':
							transformedComponent = func(...position.map(component => progress*component))[i];
							break;
						case 'multiplyAfter':
							transformedComponent = progress*func(...position)[i];
							break;
						case 'custom':
							transformedComponent = func.call(progress, ...position)[i];
							break;
					}
					return transformedComponent + Math.abs(1-progress)*position[i];
				});
			}
		}, originalPosition);
	}
	
	// creates new Point object with updated position and returns the clone
	transformMap(transformations, originalPosition, progress, stepStartIndex) {
		return Point.clone(this).transform(transformations, originalPosition, progress, stepStartIndex);
	}
	
	// updates this.position and returns Point
	transform(transformations, originalPosition, progress, stepStartIndex) {
		this.position = this.compose(transformations, originalPosition, progress, stepStartIndex);
		return this;
	}
}

class Curve {
	constructor(numPoints, dataObject = {}) {
		this.numPoints = numPoints;
		this.points = [...Array(numPoints)];
		this.data = dataObject;
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
		
		this.transformations = [];
		// this.transform adds any transformations to this.transformations array
		if (transformations.length !== 0) {
			this.transform(transformations);
		}
		
		this.data = dataObject;
		
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
		coordinatesClone.points = coordinatesClone.points.map(point => Point.clone(point));
		coordinatesClone.transformations = coordinatesClone.transformations.map(trans => Transformation.clone(trans));
		coordinatesClone.data = JSON.parse(JSON.stringify(self.data));
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
	
	getAnimation(numFrames, transformations, stepStartIndex) {
		// TODO: require transformations
		const stepInterval = 1/(numFrames-1);
		return [...Array(numFrames)].map((_, i) => this.transformMap(transformations, i*stepInterval, stepStartIndex));
	}
	
	// calls transform method on clone of this, returns transformed clone
	transformMap(transformations, progress, stepStartIndex = this.transformations.length) {
		return Coordinates.clone(this).transform(transformations, progress, stepStartIndex);
	}
	
	// transforms this.points and adds transformations to this.transformations array, returns this
	transform(transformations, progress, stepStartIndex = this.transformations.length) {
		this.transformations = this.transformations.concat(transformations);
		let transReverse = [...this.transformations].reverse();
		// mutates each Point in this.points array
		this.forEach((point,i)  => {
			point.transform(transReverse, this.positionsCartesian[i], progress, stepStartIndex)
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
				return new Curve(dim.numPoints, {'constantCoordinateComponents': constantCoordinateComponents});
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
	}
	
	*[Symbol.iterator]() {
		for (let frame of this.frames) {
			yield frame;
		}
	}
}

// const mult = 70;
// const transA = new Transformation((x,y,z) => [x*Math.cos(y/mult), x*Math.sin(y/mult),z]);
const transB = new Transformation((r,a,w) => [r + 0*Math.cos(w), a + 50*Math.cos(w), w + 50*Math.cos(r)], {stepFunction: 'multiplyAfter'});
// const transA = new Transformation(function(x,y) {
// 	return [this*x*Math.cos(this*y/mult), this*x*Math.sin(this*y/mult)];
// });
// const transB = new Transformation(function(r,a) {
// 	return [this*r*a/2/mult + .1*this*r*Math.sin(6*this*a/mult), a/1.3];
// });

const scaleY = 60;
const scaleZ = 30;
const r = (x,y,z) => x*Math.cos(y)*Math.sin(z);
const theta = (x,y,z) => x*Math.sin(y)*Math.sin(z);
const phi = (x,y,z) => x*Math.cos(z);
const transSpherical = new Transformation((x,y,z) => [r(x,y/scaleY,z/scaleZ), theta(x,y/scaleY,z/scaleZ), phi(x,y/scaleY,z/scaleZ)], {stepFunction: 'multiplyBefore'});

const transCylindrical = new Transformation((x,y,z) => [x*Math.cos(2*y/scaleY), x*Math.sin(2*y/scaleY), z], {stepFunction: 'multiplyBefore'});

const dim0 = new Dimension(0, 60*Math.PI, 6);
const dim1 = new Dimension(0, scaleY*Math.PI, 6);
const dim2 = new Dimension(0, scaleZ*2*Math.PI, 6);

// Field can be used to create Coordinates, but once created the two objects are decoupled: a change on one does not affect the other
// TO DO: find a better way to deal with Transformations and Fields when creating new Coordinates
// let coords = field.getCoordinates([dim0,dim1],0);
// let coords = new Coordinates([dim0.extend(), dim1.extend(), dim2.extend()]);
let coords = new Coordinates([dim0.extend(),dim1.extend(),dim2.extend()]);
// console.log(coords);
let coordsCyl = new Coordinates([dim0.extend(),dim1.extend(),dim2.extend()], [transCylindrical]);
// console.log(coordsA);
// const xMin = Math.min(...coords.points.map(point => point.position[0]));
// const xMinA = Math.min(...coordsA.points.map(point => point.position[0]));
let testPoint = new Point([10,10,0]);
const T1 = new Transformation((x,y,z) => [x-100,y+100,z]);
const T2 = new Transformation((x,y,z) => [2*x,y/2,z]);
// T2(...T1(...))
let testPointT_A = testPoint.transformMap([T1,T2]);
let testPointT_B = testPoint.transformMap([T1]).transform([T2]);
// console.log('========');
// console.log(testPoint.position);
// console.log(testPointT_A.position);
// console.log(testPointT_B.position);

const transTest = new Transformation((r,a,w) => [r/2, a, 0], {stepFunction: 'multiplyBefore'});
const numFrames = 120;
let animationSet = coordsCyl.getAnimation(numFrames, [transTest]);

//////////
let animation = new CoordinatesAnimation(numFrames, coords, [
		{progress: 0, transformations: []},
		{progress: 75, transformations: [transCylindrical]},
		{progress: 100, transformations: [transTest]}
	]
);
// for (let point of coords) {
// 	console.log(typeof point);
// }
// clone of this.points array!
let testIter = [...coords];
let iterator = coords[Symbol.iterator]();
// console.log(iterator.next());
// console.log(iterator.next());
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

// let animationSet = coords.getAnimation(numFrames/2, [transCylindrical]).concat(coords.transformMap([transCylindrical]).getAnimation(numFrames/2, [transTest]));
// let animationSet = coordsCyl.getAnimation(numFrames,[],0);
// let animation = new Animation();

// sequential animation
// let animationSet = coords.getAnimation(numFrames/2, [transA]).concat(coordsA.getAnimation(numFrames/2, [transB]));
// combined animation
// const animationSet = coords.getAnimation(numFrames, [transA,transB]);
// animationSet.forEach((coord,index) => coord.data.color = [270, index/(numFrames/100), 95]);

// let animationCurveSet = animationSet.map(set => set.getCurveMesh({"hideOuterCurves": true}));
let animationCurveSet = animation.frames.map(set => set.getCurveMesh({"hideOuterCurves": true}));

// // 
// let animationSet = coordSpace.interpolate(coordIndexStart,coordIndexEnd,.7);

const fps = 60;
/// P5JS ///
function setup() {
	frameRate(fps);  //default value is 60
	canvas = createCanvas(700, 550, WEBGL);
	//set origin to center of canvas
	// canvas.translate(width/2, height/2);
	// NOTE: +y points downwards
 	noLoop();
}

function draw() {
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
	
	const drawCurve = (curve) => {
		noFill();
		beginShape();
		curve.points.forEach(p => {
			const pos = p.position;
			curveVertex(pos[0], pos[1], pos[2]);
		});
		endShape();
	};
	
	let currentCurveSet = animationCurveSet[animationIndex];
	// x-curves
	stroke('orange');
	// curveSet[0].forEach(curve => drawCurve(curve));
	currentCurveSet[0].forEach(curve => drawCurve(curve));
	// y-curves
	stroke('green');
	// curveSet[1].forEach(curve => drawCurve(curve));
	currentCurveSet[1].forEach(curve => drawCurve(curve));
	// z-curves
	stroke('purple');
	// curveSet[2].forEach(curve => drawCurve(curve));
	currentCurveSet[2].forEach(curve => drawCurve(curve));

	push();
	fill('red');
	stroke('black');
	translate(...testPoint.position);
	sphere(40);
	pop();
	push();
	fill('yellow');
	translate(...testPointT_A.position);
	sphere(40);
	pop();
	push();
	stroke('blue');
	translate(...testPointT_B.position);
	sphere(40);
	pop();
	
	// all points
	// stroke('#ddd');
	// animationSet[animationIndex].forEach(p => {
	// 	const pos = p.position;
	// 	push();
	// 	stroke('purple');
	// 	translate(pos[0],pos[1],pos[2]);
	// 	point();
	// 	pop();
	// });
}
