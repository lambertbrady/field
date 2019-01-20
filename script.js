var tmax = 50;
var dt = .1;
var t = 0;

class FieldOLD {
	constructor(numDimensions, generator, range, numPoints) {
		this.n = numDimensions;
		// if only one given, array with length = 2
		// if more than one, array of arrays, outer array with length = n, inner arrays with length = 2
		this.range = range;
		this.initial = this.range[0];
		this.final = this.range[1];
		// if only a number given, set for all n.
		// otherwise, need array with length = n
		// steps = number of points - 1
		this.numPoints = numPoints;
		this.stepSize = (this.final - this.initial) / (this.numPoints - 1);
		// function to generate field from Euclidean space
		// if none is given, use Euclidean space
		this.generator = generator;

		// range, initial, final, numPoints, and stepSize need to be associated with each possible dimension
		this.coordinates = Array(this.n).fill().map(() => Array(this.numPoints).fill(null));
		
		// set initial coordinates
		this.coordinates.forEach(dimension => {
			dimension.forEach((element, index, array) => {
				array[index] = index * this.stepSize + this.initial;
				if (this.generator) {
					array[index] = this.generator(array[index]);
				}
			}, this);
		}, this);
	}
	
	/// METHODS ///
	
	// method needs to be part of Field (not Dimension) because each dimension's generating function could use variables from any dimension.
	// how should each possible variable be denoted/referred to???

	map() {};
	transform(generator) {};
	
}

var field1D = new FieldOLD(1, x => 250*Math.sin(x), [-250, 250], 9);

class Field {
	constructor(...transformations) {
		this.validate(transformations);
		
		this.numDimensions = transformations.length;
		this.transformations = Array(transformations.length).fill().map((_, index) => [transformations[index]]);
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
	
	transform(dimension, transformation) {
		this.validateTransform(transformation);
		
		// build MAP instead of 2D array (Map([dim,func],[dim,func],...))
		this.transformations[dimension].push(transformation);
		
		return this;
	}
	
	// setCoordinates(numPoints, ...ranges) where each 'range' = [initial, final]
	setCoordinates(...ranges) {
	// setCoordinates(dimension, initial, final, numPoints) {
		
		// numPoints >= 2
		// initial != final
		
		let haveEqualLengths = ranges.length === this.numDimensions;
		if (!haveEqualLengths) {
			throw new Error('Field Coordinate Error: number of range arguments must equal numDimensions');
		}
		
		function getVectorComponent(ranges, stepSizeArr, repeatArr, vectorIndex, dimension) {
			// add Dimension and/or Range object(s) to condense ranges, stepSizeArr, and repeatArr
			let convertedIndex = Math.floor(vectorIndex / repeatArr[dimension]);
			let initialVal = ranges[dimension][0];
			let stepSize = stepSizeArr[dimension];

			let euclideanVal = initialVal + (convertedIndex % ranges[dimension][2]) * stepSize;
			return euclideanVal;
		}
		
		// eventually change to range.numPoints instead of range[2]
		let size = ranges.reduce((totalPoints, range) => totalPoints * range[2], 1);
		
		function getStepSize(range) {
			let [initial, final, numPoints] = range;
			return (final - initial) / (numPoints - 1);
		}
		// add step size as property of range
		let stepSizeArr = ranges.map(range => getStepSize(range));
		
		function getRepeatValue(dimension, rangesArr) {
			// use reduce method?
			let repeat = 1;
			for (let i = dimension + 1; i < rangesArr.length; i++) {
				repeat *= rangesArr[i][2];
			}
			return repeat;
		}
		// used for each vector calculation, array is same size as vector
		let repeatArr = ranges.map((_, dimension, array) => getRepeatValue(dimension, array));
		
		// build initial Euclidean coordinates, an array of Vectors
		this.coordinates = this.euclideanCoordinates = [...Array(size)].map((_, vectorIndex) => [...Array(this.numDimensions)].map((_, dimension) => getVectorComponent(ranges, stepSizeArr, repeatArr, vectorIndex, dimension) ));
		
		return this.coordinates;
	}
}

var func0 = (x,y) => 2*x;
var func1 = (x,y) => x+y;
// var func2 = (x,y,z) => x+y;
var field = new Field(func0,func1);
var transform0A = (x,y) => x*y;
var transform1A = (x,y) => 2*y;
var transform1B = (x,y) => 2*x;
// console.log(field.transformations);
// field.transform(1,transform1A).transform(1,transform1B).transform(0,transform0A);
var func0_1D_A = (x) => Math.cos(x);
var func0_1D_B = (x) => 250*x;
var field1D = new Field(func0_1D_A);
field1D.transform(0,func0_1D_B);
// field1D.setCoordinates([0, 50*2*Math.PI, 99]);
// console.log(field1D.coordinates);

var func0_2D = (x,y) => Math.sqrt(x*x + y*y);
var func1_2D = (x,y) => Math.atan2(y, x);
var field2D = new Field(func0_2D,func1_2D);
field2D.setCoordinates([-250,250,3],[200,-200,2]);
// console.log(field2D.coordinates);

var func0_3D = (x,y,z) => x;
var func1_3D = (x,y,z) => y;
var func2_3D = (x,y,z) => z;
var field3D = new Field(func0_3D,func1_3D,func2_3D);
field3D.setCoordinates([-250,250,5],[200,-200,7],[0,100,4]);
// console.log(field3D.coordinates);

/// P5JS ///

function setup() {
	frameRate(60);  //default value is 60
	canvas = createCanvas(700, 500);
	//set origin to center of canvas
	canvas.translate(width/2, height/2);
}

function draw() {
	background(230);
	fill('red');
	stroke('#666');
	let r = 5;
	
	let coordinates = field3D.coordinates;
	coordinates.forEach(vector => ellipse(vector[0],vector[1],r,r));
	
	fill('black');
	//origin
	ellipse(0,0,10,10);
	// if (t < tmax) {
		// background(230);
		
	// } else {
		noLoop();
	// }	
	// t += dt;
}
