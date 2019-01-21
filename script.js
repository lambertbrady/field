var tmax = 50;
var dt = .1;
var t = 0;

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
		
		// build initial Euclidean coordinates
		this.coordinates = this.euclideanCoordinates = [...Array(size)].map((_, vectorIndex) => {
			// fill coordinates array with vectors
			return [...Array(this.numDimensions)].map((_, dimension) => {
				// fill vector arrays with component values
				return getVectorComponent(ranges[dimension], stepSizeArr[dimension], repeatArr[dimension], vectorIndex);
			});
		});
		
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
field1D.setCoordinates([0, 50*2*Math.PI, 99]);
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
