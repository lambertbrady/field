var tmax = 50;
var dt = .1;
var t = 0;

// updates existing array with values from another array
var updateArrayFrom = (arrayToUpdate, arrayFrom) => arrayToUpdate.map((element,index) => [...arrayFrom[index]]);

// write function to copy multidimensional array of any dimension with arguments (array, dimension) where dimension = [2, Infinity]
// creates new array from existing array
// let copyArray2D = (array) => Array(array.length).fill().map((element,index) => [...array[index]]);
var copyArray2D = (array) => updateArrayFrom(Array(array.length).fill(), array);

class Field {
	constructor(numDimensions) {
		// this.validate(transformations);
		
		this.numDimensions = numDimensions;
		
		this.transformations = [];
		
		// this.dimensions = Array(this.numDimensions).fill().map((_, index) => [transformations[index]]);
		
		// create Map object with an entry for each dimension, where key is the dimension starting at 0, and value is an array to be filled with functions representing dimensions transformations
		this.dimensions = new Map(Array(numDimensions).fill().map((_, index) => [index, []]));
	}
	
	validate(transformations) {
		let haveEqualArgumentLengths = transformations.every((element, _, array) => element.length === array[0].length);
		if (!haveEqualArgumentLengths) {
			throw new Error('Field Constructor Error: transformation functions must have equal number arguments');
		}
		let haveEqualLengths = transformations.every((element, _, array) => element.length === array.length);
		if (!haveEqualLengths) {
			throw new Error('Field Constructor Error: number of transformation functions must equal number of arguments in each transformation function');
		}
	}
	
	validateTransform(transformation) {
		let haveEqualLengths = transformation.length === this.numDimensions;
		if (!haveEqualLengths) {
			throw new Error('Field Transform Error: number of transformation arguments must equal numDimensions');
		}
	}
	
	validateTransformation(transformation) {
		// check if dimensions are within range: [0, numDimensions - 1]
		// throw warning if duplicate dimensions are included, since the earlier values will be overridden
		// check that second argument is a function with the number of arguments equal to numDimensions
		// transformation.forEach(element => ........);
	}
	
	// transformations is passed in as an array of key-value pairs, to be converted into a Map object
	addTransformation(...transformation) {
		// this.validateTransformation(transformation);
		
		this.transformations.push(new Map(transformation));
		
		return this;
	}
	
	getTransformationFunc(transformationIndex, dimension) {
		return this.transformations[transformationIndex].get(dimension);
	}
	
	getTransformedVector(targetTransformationIndex, originalVector) {
		let newVector = Array(originalVector.length).fill();

		let getComponentValue = (transformationIndex, component) => {
			// get transformation functions in reverse order so recursive calls use the latest transformation as the innermost function:
			// t0(t1(...(tm(0,1,...,n))))
			let reversedTransformationIndex = Math.abs((this.transformations.length - 1) - transformationIndex);
			
			let transformationFunc = this.getTransformationFunc(reversedTransformationIndex, component);
			let componentValues;

			if (transformationIndex > 0) {
				// use values from previous transformations as input for current transformation function
				componentValues = Array(this.numDimensions).fill().map((_, dimension) => getComponentValue(transformationIndex - 1, dimension));
			} else {
				// use orginalVector values as input for transformation function
				componentValues = originalVector;
			}

			return transformationFunc(...componentValues);
		};

		// loop through vector components to set newVector using values from originalVector
		originalVector.forEach((componentValue, componentIndex, vector) => {
			newVector[componentIndex] = getComponentValue(targetTransformationIndex, componentIndex);
		});

		return newVector;
	}
	
	// Updates this.coordinates starting at transformation associated with given index of this.transformations
	// DEFAULT targetTransformationIndex = final transformation index of this.transformations
	transformCoordinates(targetTransformationIndex = this.transformations.length - 1) {
		this.coordinates.forEach((vector, index, array)  => {
			array[index] = this.getTransformedVector(targetTransformationIndex, vector);
		});
		// console.log(this.coordinates[5]);
		// console.log(this.getTransformedVector(targetTransformationIndex, this.coordinates[5]))
		
		return this;
	}
	
	validateRanges(ranges) {
		let haveEqualLengths = ranges.length === this.numDimensions;
		if (!haveEqualLengths) {
			throw new Error('Field Range Error: number of range arguments must equal numDimensions');
		}
		let haveUniqueInitialFinal = ranges.every(range => range[0] !== range[1]);
		if (!haveUniqueInitialFinal) {
			throw new Error('Field Range Error: each range must have unique initial and final values');
		}
		let hasIntegerNumPoints = ranges.every(range => range[2] % 1 === 0);
		if (!hasIntegerNumPoints) {
			throw new Error('Field Range Error: each range must have an integer value for numPoints');
		}
		let hasCorrectNumPoints = ranges.every(range => range[2] > 1);
		if (!hasCorrectNumPoints) {
			throw new Error('Field Range Error: each range must have at least 2 numPoints');
		}
	}
	
	// setCoordinates(...ranges) where each 'range' = [initial, final, numPoints]
	setCoordinates(...ranges) {
		this.validateRanges(ranges);
		
		function getVectorComponent(range, stepSize, repeater, vectorIndex) {
			// add Dimension and/or Range object(s) to condense initialVal, repeater, and stepSize
			
			// range.initial
			let initialVal = range[0];
			// range.numPoints
			let numPoints = range[2];
			let convertedIndex = Math.floor(vectorIndex / repeater);
			
			let euclideanVal = initialVal + (convertedIndex % numPoints) * stepSize;
			return euclideanVal;
		}
		
		// eventually change to range.numPoints instead of range[2]
		// add size as property of coordinates
		let size = ranges.reduce((totalPoints, range) => totalPoints*range[2], 1);
		
		// add step size as property of range
		let stepSizeArr = ranges.map(range => {
			let [initial, final, numPoints] = range;
			return (final - initial) / (numPoints - 1);
		});
		
		// used for each vector calculation, array is same size as vector
		let repeatArr = ranges.map((_, dimension, ranges) => {
			return ranges.reduce((repeatVal, currentVal, currentIndex) => {
				if (currentIndex > dimension) {
					repeatVal *= currentVal[2];
				}
				return repeatVal;
			}, 1);
		});
		
		// build initial Cartesian coordinates
		this.cartesianCoordinates  = [...Array(size)].map((_, vectorIndex) => {
			// fill coordinates array with vectors
			return [...Array(this.numDimensions)].map((_, dimension) => {
				// fill vector arrays with component values
				return getVectorComponent(ranges[dimension], stepSizeArr[dimension], repeatArr[dimension], vectorIndex);
			});
		});
		this.coordinates = copyArray2D(this.cartesianCoordinates);
		
		// apply transformations to Cartesian coordinates
		this.transformCoordinates();
		
		return this.coordinates;
	}
}

// var func0_1D_A = (x) => 75*Math.sin(x);
// var field1D = new Field(1);
// field1D.addTransformation(0,func0_1D_A);
// field1D.setCoordinates([-2*Math.PI,2*Math.PI,300]);
// field1D.transform(0);
// var func0_1D_B = (x) => -75*Math.sin(x);
// var field1D_2 = new Field(func0_1D_B);
// field1D_2.setCoordinates([-2*Math.PI,2*Math.PI,300]);
// field1D_2.transform(0);

let f0 = (x,y) => x*Math.cos(y);
let f1 = (x,y) => x*Math.sin(y);
let g0 = (x,y) => 4*x + 20*y;
let g1 = (x,y) => 1.3*y;

let f0_of_g0 = (x,y) => (4*x + 20*y)*Math.cos(1.3*y);
let f1_of_g1 = (x,y) => (4*x + 20*y)*Math.sin(1.3*y);

let h0 = (x,y) => 4*x;
let h1 = (x,y) => y + Math.PI/4;
let field2D = new Field(2);
// update getTransformedVector method so g1 trivial mappings like g1 aren't necessary:
// if transformationFunc isn't defined, return componentValue as is
// NOTE: transformed coordinates returns f(g(h(...(x,y,...))))
// field2D.addTransformation([0,f0],[1,f1]);
// field2D.addTransformation([0,g0],[1,g1]);
field2D.addTransformation([0,f0_of_g0],[1,f1_of_g1]);
// field2D.addTransformation([0,h0],[1,h1]);
// create separate Coordinates object that includes ranges - associated with Field object somehow...
var coordinates2D = field2D.setCoordinates([0,50,11],[0,Math.PI,11]);

// var field2D_test = new Field(2);
// f0_of_g = (x,y) => (4*x)*Math.cos(2*y);
// f1_of_g = (x,y) => (4*x)*Math.sin(2*y);
// field2D_test.addTransformation([0,f0_of_g],[1,f1_of_g]);
// var coordinates2D_test = field2D_test.setCoordinates([0,250,11],[0,2*Math.PI,50]);

// var func0_3D = (x,y,z) => x;
// var func1_3D = (x,y,z) => y;
// var func2_3D = (x,y,z) => z;
// var field3D = new Field(func0_3D,func1_3D,func2_3D);
// var field3D = new Field(3);
// field3D.addTransformation(0,func0_3D).addTransformation(1,func1_3D).addTransformation(2,func2_3D);
// field3D.setCoordinates([-300,300,7],[200,-200,5],[100,0,7]);
// console.log(field3D.coordinates);

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
	
// 	field3D.coordinates.forEach(vector => {
// 		fill(map(vector[2],0,100,40,40), map(vector[2],0,100,0,200), map(vector[2],0,100,50,150));
// 		let radius = map(vector[2],0,100,14,140);
// 		ellipse(vector[0],vector[1],radius,radius);
// 	});
	
	fill('red');
	let r = 15;
	coordinates2D.forEach(vector => {
		ellipse(vector[0],vector[1],r,r);
	});
	// fill('aqua');
	// coordinates2D_test.forEach(vector => {
	// 	ellipse(vector[0],vector[1],r,r);
	// });
	
// 	fill('yellow');
// 	field1D.coordinates.forEach((vector,index,array) => {
// 		ellipse(map(index,0,array.length-1,-300,300),vector[0],10,10);
// 	});
// 	field1D_2.coordinates.forEach((vector,index,array) => {
// 		ellipse(map(index,0,array.length-1,-300,300),vector[0],10,10);
// 	});
	
	// origin
	fill('black');
	ellipse(0,0,r/2,r/2);
	
	// if (t < tmax) {
		// background(230);
		
	// } else {
		noLoop();
	// }	
	// t += dt;
}
