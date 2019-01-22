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
	
	transform(...dimensions) {
		// this.validateTransform(transformation);
		
		// build MAP instead of 2D array (Map([dim,func],[dim,func],...))
		
		// copy this.coordinates into temporary array
		let newCoordinates = Array(this.coordinates.length).fill().map((element,index) => [...this.coordinates[index]]);
		
		dimensions.forEach(dimension => {
			this.transformations[dimension].forEach(transform => {
				// update vector component	of newCoordinates using values from this.coordinates
				this.coordinates.forEach((vector, index) => {
					newCoordinates[index][dimension] = transform(...vector);
				});
			});
		});
		
		// check memory issues, this copies by reference which may cause problems
		this.coordinates = newCoordinates;
		
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

var func0_1D_A = (x) => 75*Math.sin(2*x);
var field1D = new Field(func0_1D_A);
field1D.setCoordinates([-2*Math.PI,2*Math.PI,300]);
field1D.transform(0);

var func0_2D = (x,y) => x*Math.cos(y);
var func1_2D = (x,y) => x*Math.sin(y);
var field2D = new Field(func0_2D,func1_2D);
field2D.setCoordinates([0,250,11],[0,2*Math.PI,80]);
field2D.transform(0,1);
// field2D.transform(1);

var func0_3D = (x,y,z) => x;
var func1_3D = (x,y,z) => y;
var func2_3D = (x,y,z) => z;
var field3D = new Field(func0_3D,func1_3D,func2_3D);
field3D.setCoordinates([-300,300,7],[200,-200,5],[100,0,7]);

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
	
	field3D.coordinates.forEach(vector => {
		fill(map(vector[2],0,100,40,40), map(vector[2],0,100,0,200), map(vector[2],0,100,50,150));
		let radius = map(vector[2],0,100,14,140);
		ellipse(vector[0],vector[1],radius,radius);
	});
	
	fill('red');
	let r = 15;
	field2D.coordinates.forEach(vector => {
		ellipse(vector[0],vector[1],r,r);
	});
	
	fill('yellow');
	field1D.coordinates.forEach((vector,index,array) => {
		ellipse(map(index,0,array.length-1,-300,300),vector[0],10,10);
	});
	
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
