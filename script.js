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
		
		this.generators = generators;
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
		
		this.transformations[dimension].push(transformation);
		
		return this;
	}
	
	createSubfield() {
		
	}
}

var gen0 = (x,y) => 2*x;
var gen1 = (x,y) => x+y;
// var gen2 = (x,y,z) => x+y;
var fieldTest = new Field(gen0,gen1);
var transform0A = (x,y) => x*y;
var transform1A = (x,y) => 2*y;
var transform1B = (x,y) => 2*x;
// fieldTest.transform(1,transform1A).transform(1,transform1B).transform(0,transform0A);
console.log(fieldTest.transformations);


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
	
	for (let i = 0; i < field1D.coordinates[0].length; i++) {
		ellipse(field1D.coordinates[0][i], 0, 15, 15);
	}
	fill('black');
	ellipse(0,0,10,10);
	ellipse(-250,0,10,10);
	ellipse(250,0,10,10);
	// if (t < tmax) {
		// background(230);
		
	// } else {
		noLoop();
	// }	
	// t += dt;
}
