// updates existing array with values from another array
const updateArrayFrom = (arrayToUpdate, arrayFrom) => arrayToUpdate.map((element,index) => [...arrayFrom[index]]);
// creates new array from existing 2D array (array of arrays)
const copyArray2D = (array) => updateArrayFrom([...Array(array.length)], array);

class Transformation {
	constructor(func) {
		this.func = func;
		this.numDimensions = this.func.length;
	}
	
	clone() {
		return new Transformation(this.func);
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
								 
		this.transformations = [...transformations];
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
	};
	
	/// END VALIDATION METHODS ///
	
	/// METHODS ///
	
	getCoordinates(dimensions, targetIndex = this.transformations.length, optionsObject) {
		const transformations = this.transformations.slice(0, targetIndex);
		console.log(transformations);
		return new Coordinates(dimensions, transformations, optionsObject);
	}
	
	getCoordinateSpace(...dimensions) {
		return new CoordinateSpace(this, ...dimensions);
	}
	
	/// END METHODS ///
}

class Dimension {
	constructor(initial, final, numPoints) {
		this.initial = initial;
		this.final = final; 
		this.numPoints = numPoints;
		
		this.validate();
		
		this.stepSize = (this.final - this.initial) / (this.numPoints - 1);
	}
	
	validate() {
		// check if initial and final values are unique
		let haveUniqueInitialFinal = this.initial !== this.final;
		if (!haveUniqueInitialFinal) {
			throw new Error('Field Dimension Error: dimension must have unique initial and final values');
		}
		// check if numPoints is an integer value
		let hasIntegerNumPoints = this.numPoints % 1 === 0;
		if (!hasIntegerNumPoints) {
			throw new Error('Field Dimension Error: dimension must have an integer value for numPoints');
		}
		// check if numPoints value is at least 2
		let hasCorrectNumPoints = this.numPoints >= 2;
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
	constructor(numComponents, positionVector, dataObject = {}) {
		this.numComponents = numComponents;
		// an array with length equal to numComponents
		this.positionCartesian = [...positionVector];
		this.position = [...positionVector];
		
		this.data = dataObject;
	}
	
	clone() {
		let pointClone = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
		pointClone.positionCartesian = [...this.positionCartesian];
		pointClone.position = [...this.position];
		pointClone.data = JSON.parse(JSON.stringify(this.data));
		return pointClone;
	}
	
	compose(funcs) {
		return (originalPosition, step, stepFunctionType, stepStartIndex) => funcs.reduceRight((position, func, funcIndex) => {
			if(!step && step !== 0 || funcIndex < stepStartIndex) {
				return func(...position);
			} else {
				stepFunctionType = (!stepFunctionType) ? 'multiplyBefore' : stepFunctionType;
				return position.map((_, i) => {
					let transformedComponent;
					switch (stepFunctionType) {
					// multiply by step before or after func is applied
						case 'multiplyBefore':
							transformedComponent = func(...position.map(val => step*val))[i];
							break;
						case 'multiplyAfter':
							transformedComponent = step*func(...position)[i];
							break;
						// case 'custom':
						// 	transformedComponent = = func(...position, step);
						// 	break;
					}
					return transformedComponent + Math.abs(1-step)*position[i];
				});
			}
		}, originalPosition);
	}
	
	// creates new Point object with updated position and returns the clone
	map(transformations, step, stepFunctionType, stepStartIndex) {
		const newPosition = this.compose(transformations.map(trans => trans.func))(this.positionCartesian, step, stepFunctionType, stepStartIndex);
		let pointClone = this.clone();
		pointClone.position = newPosition;
		return pointClone;
	}
	
	// updates this.position and returns Point
	transform(transformations, step, stepFunctionType, stepStartIndex) {
		this.position = this.compose(transformations.map(trans => trans.func))(this.positionCartesian, step, stepFunctionType, stepStartIndex);
		return this;
	}
}

// class Curve {
// 	constructor() {
		
// 	}
// }

class Coordinates {
	constructor(dimensions, transformations, {addControlPoints = false} = {}, dataObject = {}) {
		this.dimensions = (addControlPoints) ? dimensions.map(dim => dim.extend()) : dimensions;
		this.numDimensions = this.dimensions.length;
		this.numPoints = this.dimensions.reduce((totalPoints, dim) => totalPoints*dim.numPoints, 1);
		this.numCurves = this.dimensions.reduce((curveAccumulator,_,i) => {
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
			
			return new Point(this.numDimensions, position, {'coordinateComponents': coordinateComponents});
		});
		
		this.transformations = [];
		if (transformations.length !== 0) {
			this.transform(transformations);
		}
		
		this.data = dataObject;
		
		this.options = {
			"addControlPoints": addControlPoints
		};
	}
	
	// loops through this.points
	forEach(callback, thisArg = this) {
		for (let i = 0; i < this.points.length; i++) {
			// callback.bind(thisArg)(element, index, array)
			callback.bind(thisArg)(this.points[i], i, this.points);
		}
	}
	
	clone(newPoints) {
		let coordinatesClone = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
		coordinatesClone.points = (!newPoints) ?
			coordinatesClone.points.map(point => point.clone()) :
			newPoints;
		coordinatesClone.transformations = coordinatesClone.transformations.map(trans => trans.clone());
		coordinatesClone.data = JSON.parse(JSON.stringify(this.data));
		return coordinatesClone;
	}
	
	getAnimation(transformations, numFrames, stepFunctionType, stepStartIndex) {
		const interval = 1/(numFrames-1);
		return [...Array(numFrames)].map((_, index) => this.transformMap(transformations, index*interval, stepFunctionType, stepStartIndex));
	}
	
	// calls transform method on clone of this, returns transformed clone
	transformMap(transformations, step, stepFunctionType, stepStartIndex = this.transformations.length) {
		return this.clone().transform(transformations, step, stepFunctionType, stepStartIndex);
	}
	
	// transforms this.points and adds transformations to this.transformations array
	transform(transformations, step, stepFunctionType, stepStartIndex = this.transformations.length) {
		const transformationArr = this.transformations.concat(transformations);
		this.forEach(point  => point.transform(transformationArr, step, stepFunctionType, stepStartIndex));
		this.transformations.push(...transformations);
		return this;
	}
	
	getNumComponentCurves(componentIndex) {
		// TO DO: check that componentIndex is in range of this.dimensions [0,this.numDimensions-1]
		// make class property instead of method???
		return this.dimensions.reduce((componentCurveAccumulator,dimension,i) => {
			return componentCurveAccumulator *= (componentIndex !== i) ? dimension.numPoints : 1;
		}, 1);
	}
	
	getCurveMesh() {
		// array of curve sets for each dimension (x-curveSet, y-curveSet, z-curveSet, ...)
		let curveMesh = this.dimensions.map((dim,i) => {
			// array of curves for each curve set (x-curve_0, x-curve_1, ...)
			return [...Array(this.getNumComponentCurves(i))].map(curve => {
				// array of points for each curve (to be filled in below)
				return [...Array(dim.numPoints)];
			});
		});
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
		// fill curves with points
		this.points.forEach(point => {
			// point gets added once to each dimension of curve sets (point will be part of n curves, where n = this.numDimensions)
			point.data.coordinateComponents.forEach((coordComponent,i,arr) => {
				const curveIndex = arr.filter((_,j) => i !== j).reduce((acc,componentVal,j) => {
					const componentMultiplier = multipliersArr[i][j];
					return acc += componentMultiplier*componentVal;
				}, 0);
				const pointIndex = coordComponent;

				curveMesh[i][curveIndex][pointIndex] = point;
			});
		})
		return curveMesh;
	}
}

const mult = 70;
const transA = new Transformation((x,y,z,w) => [x*Math.cos(y/mult), x*Math.sin(y/mult),z,w]);
const transB = new Transformation((r,a,z,w) => [r + .1*r*Math.sin(6*a/mult), a, z,w]);
// const field = new Field(transA,transB);
const dim0 = new Dimension(-220, 220, 9);
const dim1 = new Dimension(-mult*Math.PI, mult*Math.PI, 9);
const dim2 = new Dimension(20, 0, 6);
const dim3 = new Dimension(-500, 500, 4);

// Field can be used to create Coordinates, but once created the two objects are decoupled: a change on one does not affect the other
// TO DO: find a better way to deal with Transformations and Fields when creating new Coordinates
// let coords = field.getCoordinates([dim0,dim1,dim2,dim3],0);
let coords = new Coordinates([dim0,dim1,dim2,dim3],[]);
const numFrames = 200;
const animationSet = coords.getAnimation([transA],numFrames,'multiplyBefore');
animationSet.forEach((coords,index) => coords.data.color = [270, index/2, 95]);
// let coords = new Coordinates([dim0,dim1]).transform([transA,transB],.5,'multiplyAfter',1);
// let coords = new Coordinates([dim0,dim1],transA).transform([transB],.5,'multiplyAfter');

// // 
// let animationSet = coordsA.interpolate([transA,transB],.7);
// // problem: coordsA and coordsB need to be same size; without transformations, can only interpolate linearly. Keep trans info with coordSpace, or add to coords?
// let animationSet = coordsA.interpolate(coordsB,.7);
// // 
// let animationSet = coordSpace.interpolate(coordIndexStart,coordIndexEnd,.7);

const fps = 60;
/// P5JS ///
function setup() {
	frameRate(fps);  //default value is 60
	canvas = createCanvas(700, 500);
	//set origin to center of canvas
	canvas.translate(width/2, height/2);
	// NOTE: +y points downwards
 	// noLoop();
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
	background(...animationSet[animationIndex].data.color);
	noFill();
	const animationCurveSet = animationSet[animationIndex].getCurveMesh();
	
	// w-curves
	colorMode(RGB);
	const c = color('rgba(255, 255, 255, .2)');
	stroke(c);
	animationCurveSet[3].forEach(curve => {
		beginShape();		
		curve.forEach(p => {
			const pos = p.position;
			curveVertex(pos[0]+pos[2]+pos[3], pos[1]-pos[2]-pos[3]/2)
		});
		endShape();
	});
	
	const drawCurve = (curve) => {
		beginShape();
		curve.forEach(p => {
			const pos = p.position;
			const w = pos[3];
			if (w > dim3.initial+1 && w < dim3.final-1) {
				curveVertex(pos[0]+pos[2]+w, pos[1]-pos[2]-w/2);
			}
		});
		endShape();
	};
	// x-curves
	stroke('orange');
	strokeWeight(2);
	animationCurveSet[0].forEach(curve => drawCurve(curve));
	// y-curves
	stroke('green');
	animationCurveSet[1].forEach(curve => drawCurve(curve));
	// z-curves
	stroke('red');
	animationCurveSet[2].forEach(curve => drawCurve(curve));
	
	// all points
	stroke('#ddd');
	animationSet[animationIndex].forEach(p => {
		const pos = p.position;
		const w = pos[3];
		if (w > dim3.initial+1 && w < dim3.final-1) {
			point(pos[0]+pos[2]+w, pos[1]-pos[2]-w/2);
		}
	});
}
