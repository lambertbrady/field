var tmax = 50;
var dt = .1;
var t = 0;

// updates existing array with values from another array
var updateArrayFrom = (arrayToUpdate, arrayFrom) => arrayToUpdate.map((element,index) => [...arrayFrom[index]]);

// creates new array from existing 2D array (array of arrays)
var copyArray2D = (array) => updateArrayFrom([...Array(array.length)], array);

class Field {
	
	/// CONSTRUCTOR ///
	
	constructor(numDimensions) {
		this.validate(numDimensions);
		
		this.numDimensions = numDimensions;
		this.transformations = [];
	}
	
	/// END CONSTRUCTOR ///
	
	/// VALIDATION METHODS ///
	
	validate(numDimensions) {
		// check if numDimensions is an integer within range: [1, Infinity]
		let hasValidNumDimensions = numDimensions >= 1 && numDimensions % 1 === 0;
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
	
	validateTransformationIndex(targetTransformationIndex) {
		// check if targetTransformationIndex is an integer within range: [0, transformations.length - 1]
		let indexMax = this.transformations.length - 1;
		let hasValidIndex =  targetTransformationIndex >= 0 && targetTransformationIndex <= indexMax && targetTransformationIndex % 1 === 0;
			if (!hasValidIndex) {
				throw new Error('Field Transformation Error: targetTransformationIndex must be an integer between 0 and ' + indexMax);
			}
	};
	
	/// END VALIDATION METHODS ///
	
	/// METHODS ///
	
	// Adds a transformation to the end of this.transformations
	// addTransformation(...transformation) where 'transformation' is an array of key-value pairs to be converted into a Map object
	addTransformation(...transformation) {
		this.validateTransformation(transformation);
		
		this.transformations.push(new Map(transformation));
		
		return this;
	}
	
	getTransformationFunc(transformationIndex, dimension) {
		return this.transformations[transformationIndex].get(dimension);
	}
	
	getCoordinateSpace(...ranges) {
		return new CoordinateSpace(this, ...ranges);
	}
	
	/// END METHODS ///
}

class CoordinateSpace {
	
	constructor(field, ...ranges) {
		this.validateRanges(field, ranges);
		
		this.field = field;
		this.ranges = ranges.map(range => {
			return {initial: range[0], final: range[1], numPoints: range[2]};
		});
		this.size = this.ranges.reduce((totalPoints, range) => totalPoints*range.numPoints, 1);
		
		this.setCartesianCoordinates(this.ranges);
		this.coordinates = copyArray2D(this.cartesianCoordinates);

		// apply transformations to Cartesian coordinates if any have been added
		if (this.field.transformations.length > 0) {
			this.transformCoordinates();
		}
	}
	
	setCartesianCoordinates(ranges) {
		
		// add step size as property of range
		let stepSizeArr = ranges.map(range => {
			return (range.final - range.initial) / (range.numPoints - 1);
		});

		// used for each vector calculation, array is same size as vector
		let repeatArr = ranges.map((_, dimension, ranges) => {
			return ranges.reduce((repeatVal, currentRange, currentRangeIndex) => {
				if (currentRangeIndex > dimension) {
					repeatVal *= currentRange.numPoints;
				}
				return repeatVal;
			}, 1);
		});

		function getCartesianVectorComponent(range, stepSize, repeater, vectorIndex) {
			let convertedIndex = Math.floor(vectorIndex / repeater);
			return range.initial + (convertedIndex % range.numPoints) * stepSize;
		}
		
		// create empty Cartesian coordinates array
		this.cartesianCoordinates = [...Array(this.size)].map((_, vectorIndex) => {
			// fill Cartesian coordinates array with empty vector arrays
			return [...Array(this.field.numDimensions)].map((_, dimension) => {
				// fill vectors with calculated component values
				return getCartesianVectorComponent(ranges[dimension], stepSizeArr[dimension], repeatArr[dimension], vectorIndex);
			});
		});
	}
	
	// Loops through this.coordinates array
	// thisArg DEFAULT = this (Coordinates object upon which the method was called)
	forEach(callback, thisArg = this) {
		for (let i = 0; i < this.coordinates.length; i++) {
			callback.bind(thisArg)(this.coordinates[i], i, this.coordinates);
		}
	}
	
	validateRange(range) {
		// check if initial and final range values are unique
		let haveUniqueInitialFinal = range[0] !== range[1];
		if (!haveUniqueInitialFinal) {
			throw new Error('Field Range Error: range must have unique initial and final values');
		}
		// check if numPoints is an integer value
		let hasIntegerNumPoints = range[2] % 1 === 0;
		if (!hasIntegerNumPoints) {
			throw new Error('Field Range Error: range must have an integer value for numPoints');
		}
		// check if numPoints value is at least 2
		let hasCorrectNumPoints = range[2] >= 2;
		if (!hasCorrectNumPoints) {
			throw new Error('Field Range Error: range must have at least 2 numPoints');
		}
	}
	
	validateRanges(field, ranges) {
		// check if number of ranges provided is equal to number of dimensions
		let haveEqualLengths = ranges.length === field.numDimensions;
		if (!haveEqualLengths) {
			throw new Error('Field Ranges Error: number of ranges must equal numDimensions');
		}
		// validate each range
		ranges.forEach(range => this.validateRange(range));
	}
	
	getTransformedVectorComponent(transformationIndex, component, vector) {
		let transformedComponent;
		
		// get transformation functions in reverse order so recursive calls use the latest transformation as the innermost function: t0(t1(...(tm(0,1,...,n))))
		let reversedTransformationIndex = Math.abs((this.field.transformations.length - 1) - transformationIndex);
		let transformationFunc = this.field.getTransformationFunc(reversedTransformationIndex, component);
		
		if (!transformationFunc) {
		// if transformation function is undefined, return vector component value as is
			transformedComponent = vector[component];
		} else {
			let componentValues;
			
			if (transformationIndex > 0) {
			// use values from previous transformations as input for current transformation function
				componentValues = [...Array(this.field.numDimensions)].map((_, component) => this.getTransformedVectorComponent(transformationIndex - 1, component, vector));
			} else {
			// use vector values as input for transformation function
				componentValues = vector;
			}
			transformedComponent = transformationFunc(...componentValues);
		}
		return transformedComponent;
	}
	
	getTransformedVector(targetTransformationIndex, vector) {
		let transformedVector = [...Array(vector.length)];
		
		// loop through vector components to set newVector using values from originalVector
		vector.forEach((_, component) => {
			transformedVector[component] = this.getTransformedVectorComponent(targetTransformationIndex, component, vector);
		});

		return transformedVector;
	}

	// Updates this.coordinates starting at transformation associated with given index of this.transformations
	// transformCoordinates(targetTransformationIndex) where DEFAULT = final transformation index of this.transformations
	transformCoordinates(targetTransformationIndex = this.field.transformations.length - 1) {
		this.field.validateTransformationIndex(targetTransformationIndex);
		
		this.coordinates.forEach((vector, index, array)  => {
			array[index] = this.getTransformedVector(targetTransformationIndex, vector);
		});
		
		return this.coordinates;
	}
	
}

var func0_1D_A = (x) => 75*Math.sin(x);
var field1D = new Field(1);
field1D.addTransformation([0,func0_1D_A]);

let scaleX = (x,y) => 100*x;
let yofx = (x) => 50*Math.sin(x);
let stack = (x,y) => -1*yofx(x) + y;
let field2D = new Field(2);
field2D.addTransformation([0,scaleX],[1,stack]);
var coordinates2D = new CoordinateSpace(field2D,[-Math.PI,Math.PI,100],[-150,150,3]);

let f0 = (x,y) => x*Math.cos(y) - 100;
let f1 = (x,y) => x*Math.sin(y) + 100;
let g0 = (x,y) => 4.3*x + 20*y;
let g1 = (x,y) => 2.1*y;
let h0 = (x,y) => x*y;
let polar = new Field(2);
polar.addTransformation([0,f0],[1,f1]).addTransformation([0,g0],[1,g1]).addTransformation([0,h0]);
var polarCoordinates = new CoordinateSpace(polar,[0,25,15],[0,Math.PI,50]);

var func0_3D = (x,y,z) => x + z - 42;
var func1_3D = (x,y,z) => y + z - 42;
var func2_3D = (x,y,z) => 1.2*z;
var field3D = new Field(3);
field3D.addTransformation([0,func0_3D],[1,func1_3D],[2,func2_3D]);
var coordinates3D = field3D.getCoordinateSpace([-300,300,6],[200,-200,5],[100,0,6]);

/// P5JS ///
function setup() {
	frameRate(60);  //default value is 60
	canvas = createCanvas(700, 500);
	//set origin to center of canvas
	canvas.translate(width/2, height/2);
	// NOTE: +y points downwards
}

function draw() {
	background(230);
	stroke('#222');
	
	coordinates3D.forEach(vector => {
		fill(map(vector[2],0,100,40,40), map(vector[2],0,100,0,200), map(vector[2],0,100,50,150));
		let radius = map(vector[2],0,100,14,140);
		ellipse(vector[0],vector[1],radius,radius);
	});
	
	fill('aqua');
	let r = 15;
	coordinates2D.forEach(vector => {
		ellipse(vector[0],vector[1],r,r);
	});
	fill('red');
	polarCoordinates.forEach(vector => {
		ellipse(vector[0],vector[1],r,r);
	});
	
	fill('yellow');
	field1D.getCoordinateSpace([-2*Math.PI,2*Math.PI,300]).forEach((vector,index,array) => {
		ellipse(map(index,0,array.length-1,-300,300),vector[0],10,10);
	});
	
	// origin
	// fill('black');
	// ellipse(0,0,r/2,r/2);
	
	// if (t < tmax) {
		// background(230);
		
	// } else {
		noLoop();
	// }	
	// t += dt;
}
