// updates existing array with values from another array
const updateArrayFrom = (arrayToUpdate, arrayFrom) => arrayToUpdate.map((element,index) => [...arrayFrom[index]]);
// creates new array from existing 2D array (array of arrays)
const copyArray2D = (array) => updateArrayFrom([...Array(array.length)], array);
const discretize = (initial, final, numPoints) => {
	const step = (final - initial) / (numPoints - 1);
	return [...Array(numPoints)].map((_, i) => initial + i*step);
}

class Transformation {
	constructor(numDimensions, ...components) {
		this.numDimensions = numDimensions;
		
		if (components.length === 0) {
			this.functionSet = this.cartesian;
		} else {
			this.functionSet = new Map(components);
		}
	}
	
	get cartesian() {
		// create array of arbitrary argument names
		const argStrings = [...Array(this.numDimensions)].map((_,index) => 'dimension' + index.toString());
		// create array of transformation functions using argument names
		const transformationFunctions = argStrings.map((_,index,array) => new Function(...[...array, 'return ' + array[index].toString()]));
		
		const transformationArray = transformationFunctions.map((_,index,array) => [index, array[index]]);
		
		return new Map(transformationArray);
	}
}

class Field {
	
	constructor(numDimensions, ...transformations) {
		this.numDimensions = numDimensions;
		
		this.validate();
		
		this.transformations = [new Transformation(numDimensions), ...transformations];
	}
	
	/// VALIDATION METHODS ///
	
	validate() {
		// check if numDimensions is an integer within range: [1, Infinity]
		let hasValidNumDimensions = this.numDimensions >= 1 && this.numDimensions % 1 === 0;
		if (!hasValidNumDimensions) {
			throw new Error('Field Constructor Error: numDimensions must be an integer greater than or equal to 1');
		}
	}
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
		let hasDuplicateDimensions = dimensionArray.length !== dimensionSet.size;
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
	
	// Adds a transformation to the end of this.transformations
	// addTransformation(...transformation) where 'transformation' is an array of key-value pairs to be converted into a Map object
	addTransformation(...transformation) {
		this.validateTransformation(transformation);
		
		this.transformations.push(new Transformation(this.numDimensions, ...transformation));
		return this;
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
}

class Point {
	constructor(numComponents, position, dataObject = {}) {
		this.numComponents = numComponents;
		// an array with length equal to numComponents
		this.position = position;
		this.data = dataObject;
	}
	
	getTransformedPositionComponent(componentIndex, transformations, step, currentTransformaionIndex = transformations.length - 1) {
		let transformedComponent;
		
		// get transformation functions in reverse order so recursive calls use the latest transformation as the innermost function: Tstart(T1(T2(...(Ttarget(component_0,...,component_n)))))
		const transformationIndex = transformations.length - 1 - currentTransformaionIndex;
		const transformationFunc = transformations[transformationIndex].functionSet.get(componentIndex);
		
		if (!transformationFunc) {
			// if transformation function is undefined, return position component value as is
			transformedComponent = this.position[componentIndex];
		} else {
			let componentValues;
			
			if (currentTransformaionIndex > 0) {
				// use values from previous transformations as input for current transformation function
				componentValues = [...Array(this.position.length)].map((_, component) => this.getTransformedPositionComponent(component, transformations, step, currentTransformaionIndex - 1));
			} else {
				// use position values as input for transformation function
				componentValues = this.position;
			}
			
			////////////
			///////// add switch statement for step function types
			// default: (when step is undefined)
			if (!step && step !== 0) {
				transformedComponent = transformationFunc(...componentValues);
			} else {
				// transformedComponent = transformationFunc(...componentValues.map(component => step*component)) + Math.abs(1-step)*this.position[componentIndex];
			transformedComponent = step*transformationFunc(...componentValues) + Math.abs(1-step)*this.position[componentIndex];
			}
		}
		
		return transformedComponent;
	}
	
	transform(transformations, step) {
		let transformedPosition = [...Array(this.position.length)];
		
		// loop through position components to set transformedPosition using values from originalPosition
		this.position.forEach((_, componentIndex) => {
			transformedPosition[componentIndex] = this.getTransformedPositionComponent(componentIndex, transformations, step);
		});
		
		this.position = transformedPosition;
		
		return this;
	}
}

class Coordinates {
	constructor(dimensions, transformations) {
		this.dimensions = dimensions;
		this.size = this.dimensions.reduce((totalPoints, dimension) => totalPoints*dimension.numPoints, 1);
		this.numComponents = this.dimensions.length;
		
		const repeatArr = this.dimensions.map((_, index, arr) => {
			return arr.reduce((repeatVal, currentDimension, currentDimensionIndex) => {
				if (currentDimensionIndex > index) {
					repeatVal *= currentDimension.numPoints;
				}
				return repeatVal;
			}, 1);
		});
		this.points = [...Array(this.size)].map((_, coordinateIndex) => {
			// const numComponents = this.field.numDimensions;
			let coordinateComponents = [...Array(this.numComponents)];
			let position = [...Array(this.numComponents)];
			
			// set Point position (Cartesian) and subSpaceIndex for each component based on dimension, repeatArr, and coordinateIndex
			// i is the componentIndex
			for (let i = 0; i < this.numComponents; i++) {
				const dimension = this.dimensions[i];
				coordinateComponents[i] = Math.floor(coordinateIndex / repeatArr[i]) % dimension.numPoints;
				position[i] = dimension.initial + coordinateComponents[i] * dimension.stepSize;
			}
			
			return new Point(this.numComponents, position, {'coordinateComponents': coordinateComponents});
		});
		
		if (transformations) {
			this.transform(transformations);
		}
	}
	
	// loops through this.points
	forEach(callback, thisArg = this) {
		for (let i = 0; i < this.points.length; i++) {
			// callback.bind(thisArg)(element, index, array)
			callback.bind(thisArg)(this.points[i], i, this.points);
		}
	}
	
	transform(transformations, step) {
		this.forEach(point  => point.transform(transformations, step));
		return this;
	}
}

class CoordinateSpace {
	
	constructor(field, ...dimensions) {
		this.field = field;
		this.dimensions = dimensions.map(dimension => new Dimension(...dimension));
		
		this.validate();
		
		this.coordinateSet = [...Array(this.field.transformations.length)].map((_, index) => {
			const transformations = this.field.transformations.slice(0, index + 1);
			return new Coordinates(this.dimensions, transformations);
		});
	}
	
	get coordinates() {
		return this.coordinateSet[this.coordinateSet.length - 1];
	}
	
	// Loops through this.coordinates.points array
	// thisArg DEFAULT = this (CoordinateSpace object upon which the method was called)
	// NOTE: 'this' will NOT work with an arrow function. Instead, call method with the following code:
	// CoordinateSpaceObj.forEach(function(args) {...}, this)
	forEach(callback, thisArg = this) {
		for (let i = 0; i < this.coordinates.size; i++) {
			// callback.bind(thisArg)(element, index, array)
			callback.bind(thisArg)(this.coordinates.points[i], i, this.coordinates.points);
		}
	}
	
	validate() {
		// check if number of dimensions provided is equal to number of dimensions
		let haveEqualLengths = this.dimensions.length === this.field.numDimensions;
		if (!haveEqualLengths) {
			throw new Error('Field Dimensions Error: number of dimensions must equal numDimensions');
		}
	}
}

// let innerFuncX = (x,y) => x*y/120;
// let innerFuncY = (x,y) => (Math.pow(x,2) - Math.pow(y,2))/2/120;
let funcX = (x,y) => x*Math.cos(y);
let funcY = (x,y) => x*Math.sin(y);
// let innerFuncX = (x,y) => x*Math.tan(x/250*Math.cos(y));
// let innerFuncY = (x,y) => x*Math.tan(x/250*Math.sin(x/10+y));
// let innerFuncX = (x,y) => 25/Math.sin(y);
// let innerFuncY = (x,y) => .5*x/Math.cos(y);
// let funcY = (x,y) => step*(-1000/(x*innerFunc(x)) + y) + Math.abs(1-step)*y;
// let funcY = (x,y) => step*(1000/(x*Math.tan(x/50)) + y) + Math.abs(1-step)*y;
// let funcY = (x,y) => step*(8000/(x*y+x*x)) + Math.abs(1-step)*y;
// const trans1 = new Transformation(2);
const trans1 = new Transformation(2, [0,funcX], [1,funcY]);
// const trans2 = new Transformation(2, [0,(x,y) => x + .1*x*Math.sin(6*y)]);
var field = new Field(2, trans1);
// field.addTransformation([0,funcX],[1,funcY]);
field.addTransformation([0,(x,y) => x + .1*x*Math.sin(6*y)]);

let delta = 1;
// field.addTransformation([0,(x,y) => x + 100]);
// field.addTransformation([0,(x,y) => delta*250*Math.sin(delta*x) + Math.abs(1-delta)*x]);
// field.addTransformation([0,(x,y) => .5*x],[1,(x,y) => 2*y]);
// field.addTransformation([0,(x,y) => 3*x],[1,(x,y) => y/10]);
// field.addTransformation([0,(x,y) => 1.5*x],[1,(x,y) => y/5]);
// let space = field.getCoordinateSpace([0,100,3],[0,50,3]);
// let space = field.getCoordinateSpace([-200,200,151],[-200,200,151]);
let space = field.getCoordinateSpace([0,200,10],[0,2*Math.PI,100]);
// let space = field.getCoordinateSpace([-200,200,10],[0,2*Math.PI,10]);
// console.log(space.field.transformationsTest[1].functionSet);
console.log(space.field.transformations[1]);
// const p1 = space.transformCoordinates(new Coordinates(space.dimensions), 0, 1).points[117];
// const p2 = space.transformCoordinates(new Coordinates(space.dimensions), 1, 1).points[117];
// console.log(p1);
// console.log(p2);
// var func0_1D_A = (x) => 1000/(x*x/100+x);
// var field1D = new Field(1);
// field1D.addTransformation([0,func0_1D_A]);
// let coordinateSpace1D = field1D.getCoordinateSpace([-200,200,51]);

// let scaleX = (x,y) => 100*x;
// let yofx = (x) => 50*Math.sin(x);
// let stack = (x,y) => -1*yofx(x) + y;
// let field2D = new Field(2);
// field2D.addTransformation([0,scaleX],[1,stack]);
// var coordinateSpace2D = new CoordinateSpace(field2D,[-Math.PI,Math.PI,50],[-150,150,5]);
// console.log(f0);
// let f0 = (x,y) => x*Math.cos(y) - 100;
// let f1 = (x,y) => x*Math.sin(y) + 100;
// const gConst = 1;
// let g0 = (x,y) => gConst*(4.3*x + 20*y) + Math.abs(1 - gConst)*x;
// let g1 = (x,y) => gConst*(2.1*y) + Math.abs(1 - gConst)*y;
// const hConst = 1;
// let h0 = (x,y) => hConst*(x*y) + Math.abs(1 - hConst)*x;
// let polar = new Field(2);
// polar.addTransformation([0,f0],[1,f1]);
// polar.addTransformation([0,g0],[1,g1]);
// polar.addTransformation([0,h0]);

// var func0_3D = (x,y,z) => x + z - 42;
// var func1_3D = (x,y,z) => y + z - 42;
// var func2_3D = (x,y,z) => 1.3*z;
// var field3D = new Field(3);
// // field3D.addTransformation([0,func0_3D],[1,func1_3D],[2,func2_3D]);
// var coordinateSpace3D = field3D.getCoordinateSpace([-300,300,6],[200,-200,5],[100,0,15]);

/// P5JS ///
function setup() {
	frameRate(60);  //default value is 60
	canvas = createCanvas(700, 500);
	//set origin to center of canvas
	canvas.translate(width/2, height/2);
	// NOTE: +y points downwards
	noLoop();
}

function draw() {
	background(230);
	stroke('#222');
	noStroke();
	
	let frame = Math.floor(frameCount/10);
	
	// coordinateSpace3D.forEach(function(coordinate) {
	// 	let radius = map(coordinate.position[2],0,100,14,140);
	// 	let arr = coordinate.subSpaceIndices;
	// 	const k0 = 1, k1 = 3, k2 = 1;
	// 	((k0*arr[0] + k1*arr[1] + k2*arr[2]) % this.dimensions[2].numPoints == frame % this.dimensions[2].numPoints)
	// 		? fill('black')
	// 		: fill(map(coordinate.position[2],0,100,40,40),
	// 									map(coordinate.position[2],0,100,0,200),
	// 									map(coordinate.position[2],0,100,50,150));
	// 	ellipse(coordinate.position[0],coordinate.position[1],radius,radius);
	// });
	
	// coordinateSpace2D.forEach(function(coordinate) {
	// 	(coordinate.subSpaceIndices[0] == frame % this.dimensions[0].numPoints ||
	// 	 coordinate.subSpaceIndices[1] == 1)
	// 		? fill('orange') : fill('purple');
	// 	ellipse(coordinate.position[0],coordinate.position[1],20,8);
	// });
	
// 	noFill();
	stroke('#222');
// 	beginShape();
// 	polarCoordinateSpace.forEach(coordinate => curveVertex(...coordinate.position));
// 	endShape();
// 	noStroke();
	
	fill('red');
	// coordinateSpace.forEach(function(coordinate) {
		// (coordinate.subSpaceIndices[0] == frame % this.dimensions[0].numPoints ||
		 // coordinate.subSpaceIndices[1] == frame % this.dimensions[1].numPoints)
			// ? fill('red') : fill('yellow');
		// ellipse(coordinate.position[0],coordinate.position[1],13,13);
	// });
	
	space.coordinateSet[0].transform(space.field.transformations).forEach(function(coordinate) {
		ellipse(coordinate.position[0],coordinate.position[1],13,13);
	})
	
	// coordinateSpace1D.forEach(function(coordinate, index, arr) {
	// 	fill('yellow');
	// 	stroke('#444');
	// 	ellipse(map(index,0,arr.length-1,-200,200),coordinate.position[0],15,15);
	// });
	
// 	noFill();
// 	stroke('aqua');
// 	strokeWeight(4);
// 	beginShape();
// 	coordinateSpace1D.forEach(function(coordinate,index,array) {
// 		let x = map(index, 0, array.length-1, -300, 300);
// 		curveVertex(x,coordinate.position[0]);
// 	});
// 	endShape();
// 	noStroke();
	
// 	fill('#444');
// 	stroke('#fff');
// 	strokeWeight(2);
// 	let coords = coordinateSpace1D.coordinates;
// 	let index = frame % coords.length;
// 	ellipse(map(index, 0, coords.length-1, -300, 300), coords[index].position[0], 15, 15);
}
