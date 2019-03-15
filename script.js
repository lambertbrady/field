// updates existing array with values from another array
var updateArrayFrom = (arrayToUpdate, arrayFrom) => arrayToUpdate.map((element,index) => [...arrayFrom[index]]);

// creates new array from existing 2D array (array of arrays)
var copyArray2D = (array) => updateArrayFrom([...Array(array.length)], array);

var discretize = (initial, final, numPoints, array = [...Array(numPoints)]) => {
	const interval = (final - initial) / (numPoints - 1);
	array.forEach((_, i, arr) => arr[i] = initial + i*interval);
	return array;
}

class Field {
	
	/// CONSTRUCTOR ///
	
	constructor(numDimensions) {
		this.numDimensions = numDimensions;
		
		this.validate();
		
		this.transformations = [this.getCartesianTransformation(numDimensions)];
	}
	
	/// END CONSTRUCTOR ///
	
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
	
	getCartesianTransformation(numDimensions) {
		// create array of arbitrary argument names
		const argStrings = [...Array(numDimensions)].map((_,index) => 'dimension' + index.toString());
		// create array of transformation functions using argument names
		const transformationFunctions = argStrings.map((_,index,array) => new Function(...[...array, 'return ' + array[index].toString()]));
		
		const transformationArray = transformationFunctions.map((_,index,array) => [index, array[index]]);
		return new Map(transformationArray);
	};
	
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

class Coordinate {
	constructor(numComponents) {
		this.numComponents = numComponents;
		this.position = [...Array(numComponents)];
		this.subSpaceIndices = [...Array(numComponents)];
		this.data = {};
	}
}

class CoordinateSpace {
	
	constructor(field, ...dimensions) {
		this.field = field;
		this.dimensions = dimensions.map(dimension => new Dimension(...dimension));
		
		this.validate();
		
		this.size = this.dimensions.reduce((totalPoints, dimension) => totalPoints*dimension.numPoints, 1);
		this.setCoordinates();
	}
	
	get coordinates() {
		return this.coordinateSet[this.coordinateSet.length - 1];
	}
	
	setCoordinates() {
		
		// used for each vector calculation, array is same size as this.dimensions
		let repeatArr = this.dimensions.map((_, index, dimensions) => {
			return dimensions.reduce((repeatVal, currentDimension, currentDimensionIndex) => {
				if (currentDimensionIndex > index) {
					repeatVal *= currentDimension.numPoints;
				}
				return repeatVal;
			}, 1);
		});

		// add Cartesian coordinates
		let cartesianCoordinates = [...Array(this.size)].map((_, coordinateIndex) => {
			const numComponents = this.field.numDimensions;
			let coordinate = {numComponents: numComponents,
									position: [...Array(numComponents)],
									subSpaceIndices: [...Array(numComponents)],
									data: {}};
			
			// loop through coordinate components
			for (let i = 0; i < coordinate.numComponents; i++) {
				const dimension = this.dimensions[i];
				const subSpaceIndex = Math.floor(coordinateIndex / repeatArr[i]) % dimension.numPoints;
				
				coordinate.position[i] = dimension.initial + subSpaceIndex*dimension.stepSize;
				coordinate.subSpaceIndices[i] = subSpaceIndex;
			}
			
			return coordinate;
		});
		
		// fill coordinateSet with copies of cartesian coordinates
		this.coordinateSet = [...Array(this.field.transformations.length)].map(coordinates => {
			let coordinatesClone = cartesianCoordinates.map(coordinateObj => Object.assign({},coordinateObj));
			return coordinatesClone;
		});
		
		// apply transformations and update each coordinates array in this.coordinateSet
		this.coordinateSet.forEach((coordinates, index, array) => {
			array[index] = this.getTransformedCoordinates(coordinates, index);
		});
	}
	
	// Loops through this.coordinates array
	// thisArg DEFAULT = this (CoordinateSpace object upon which the method was called)
	// NOTE: 'this' will NOT work with an arrow function. Instead, call method with the following code:
	// CoordinateSpaceObj.forEach(function(args) {...}, this)
	forEach(callback, thisArg = this) {
		for (let i = 0; i < this.size; i++) {
			// callback.bind(thisArg)(element, index, array)
			callback.bind(thisArg)(this.coordinates[i], i, this.coordinates);
		}
	}
	
	validate() {
		// check if number of dimensions provided is equal to number of dimensions
		let haveEqualLengths = this.dimensions.length === this.field.numDimensions;
		if (!haveEqualLengths) {
			throw new Error('Field Dimensions Error: number of dimensions must equal numDimensions');
		}
	}
	
	getTransformedPositionComponent(targetIndex, startIndex, componentIndex, position, currentIndex = targetIndex) {
		let transformedComponent;
		
		// get transformation functions in reverse order so recursive calls use the latest transformation as the innermost function: Tstart(T1(T2(...(Ttarget(component_0,...,component_n)))))
		let transformationIndex = targetIndex - currentIndex + startIndex;
		let transformationFunc = this.field.getTransformationFunc(transformationIndex, componentIndex);
		
		if (!transformationFunc) {
		// if transformation function is undefined, return vector component value as is
			transformedComponent = position[componentIndex];
		} else {
			let componentValues;
			
			if (currentIndex > startIndex) {
			// use values from previous transformations as input for current transformation function
				componentValues = [...Array(position.length)].map((_, component) => this.getTransformedPositionComponent(targetIndex, startIndex, component, position, currentIndex - 1));
			} else {
			// use vector values as input for transformation function
				componentValues = position;
			}
			// transformedComponent = transformationFunc(...componentValues);
			const step = 1;
			transformedComponent = transformationFunc(...componentValues.map(component => step*component)) + Math.abs(1-step)*position[componentIndex];
			// transformedComponent = step*transformationFunc(...componentValues) + Math.abs(1-step)*position[componentIndex];
		}
		
		return transformedComponent;
	}
	
	getTransformedPosition(targetIndex, startIndex, position) {
		let transformedPosition = [...Array(position.length)];
		
		// loop through coordinate position components to set newVector using values from originalVector
		position.forEach((component, componentIndex) => {
			transformedPosition[componentIndex] = this.getTransformedPositionComponent(targetIndex, startIndex, componentIndex, position);
		});
		
		return transformedPosition;
	}

	// Returns transformed coordinates starting at transformation associated with given index of this.transformations
	// transformCoordinates(targetIndex) where DEFAULT = final transformation index of this.transformations
	getTransformedCoordinates(coordinates, targetIndex = this.field.transformations.length - 1, startIndex = 0) {
		//////
		this.field.validateTargetIndex(targetIndex);
		
		let transformedCoordinates = coordinates.map(coordinateObj => Object.assign({},coordinateObj));;
		
		transformedCoordinates.forEach((coordinate, coordinateIndex, array)  => {
			array[coordinateIndex].position = this.getTransformedPosition(targetIndex, startIndex, coordinate.position);
		});
		
		return transformedCoordinates;
	}
}

let step = 1;
// let innerFuncX = (x,y) => x*y/120;
// let innerFuncY = (x,y) => (Math.pow(x,2) - Math.pow(y,2))/2/120;
let innerFuncX = (x,y) => x*Math.cos(y);
let innerFuncY = (x,y) => x*Math.sin(y);
// let innerFuncX = (x,y) => x*Math.tan(x/250*Math.cos(y));
// let innerFuncY = (x,y) => x*Math.tan(x/250*Math.sin(x/10+y));
// let innerFuncX = (x,y) => 25/Math.sin(y);
// let innerFuncY = (x,y) => .5*x/Math.cos(y);
let funcX = (x,y) => innerFuncX(step*x,step*y) + Math.abs(1-step)*x;
let funcY = (x,y) => innerFuncY(step*x,step*y) + Math.abs(1-step)*y;
// let funcY = (x,y) => step*(-1000/(x*innerFunc(x)) + y) + Math.abs(1-step)*y;
// let funcY = (x,y) => step*(1000/(x*Math.tan(x/50)) + y) + Math.abs(1-step)*y;
// let funcY = (x,y) => step*(8000/(x*y+x*x)) + Math.abs(1-step)*y;
var field = new Field(2);

let delta = 1;
field.addTransformation([0,funcX],[1,funcY]);
field.addTransformation([0,(x,y) => x + .1*x*Math.sin(6*y)]);
// field.addTransformation([0,(x,y) => delta*250*Math.sin(delta*x) + Math.abs(1-delta)*x]);
// field.addTransformation([0,(x,y) => .5*x],[1,(x,y) => 2*y]);
// field.addTransformation([0,(x,y) => 3*x],[1,(x,y) => y/10]);
// field.addTransformation([0,(x,y) => 1.5*x],[1,(x,y) => y/5]);
// let space = field.getCoordinateSpace([0,100,3],[0,50,3]);
// let space = field.getCoordinateSpace([-200,200,151],[-200,200,151]);
let space = field.getCoordinateSpace([0,200,10],[0,2*Math.PI,100]);
// let space = field.getCoordinateSpace([-200,200,10],[0,2*Math.PI,10]);

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
const hConst = gConst = fConst = 1;
const fConst0 = 0;
let f0x = (x,y) => fConst0*(x*Math.cos(fConst0*y) + 100) + Math.abs(1 - fConst0)*x;
let f0y = (x,y) => fConst0*(x*Math.sin(fConst0*y) + 100) + Math.abs(1 - fConst0)*y;
const fConst1 = .1;
let f1x = (x,y) => fConst1*(x*Math.cos(fConst1*y) + 100) + Math.abs(1 - fConst1)*x;
let f1y = (x,y) => fConst1*(x*Math.sin(fConst1*y) + 100) + Math.abs(1 - fConst1)*y;
const fConst2 = .2;
let f2x = (x,y) => fConst2*(x*Math.cos(fConst2*y) + 100) + Math.abs(1 - fConst2)*x;
let f2y = (x,y) => fConst2*(x*Math.sin(fConst2*y) + 100) + Math.abs(1 - fConst2)*y;
const fConst3 = .3;
let f3x = (x,y) => fConst3*(x*Math.cos(fConst3*y) + 100) + Math.abs(1 - fConst3)*x;
let f3y = (x,y) => fConst3*(x*Math.sin(fConst3*y) + 100) + Math.abs(1 - fConst3)*y;
const fConst4 = .4;
let f4x = (x,y) => fConst4*(x*Math.cos(fConst4*y) + 100) + Math.abs(1 - fConst4)*x;
let f4y = (x,y) => fConst4*(x*Math.sin(fConst4*y) + 100) + Math.abs(1 - fConst4)*y;
const fConst5 = .5;
let f5x = (x,y) => fConst5*(x*Math.cos(fConst5*y) + 100) + Math.abs(1 - fConst5)*x;
let f5y = (x,y) => fConst5*(x*Math.sin(fConst5*y) + 100) + Math.abs(1 - fConst5)*y;
const fConst6 = .6;
let f6x = (x,y) => fConst6*(x*Math.cos(fConst6*y) + 100) + Math.abs(1 - fConst6)*x;
let f6y = (x,y) => fConst6*(x*Math.sin(fConst6*y) + 100) + Math.abs(1 - fConst6)*y;
const fConst7 = .7;
let f7x = (x,y) => fConst7*(x*Math.cos(fConst7*y) + 100) + Math.abs(1 - fConst7)*x;
let f7y = (x,y) => fConst7*(x*Math.sin(fConst7*y) + 100) + Math.abs(1 - fConst7)*y;
const fConst8 = .8;
let f8x = (x,y) => fConst8*(x*Math.cos(fConst8*y) + 100) + Math.abs(1 - fConst8)*x;
let f8y = (x,y) => fConst8*(x*Math.sin(fConst8*y) + 100) + Math.abs(1 - fConst8)*y;
const fConst9 = .9;
let f9x = (x,y) => fConst9*(x*Math.cos(fConst9*y) + 100) + Math.abs(1 - fConst9)*x;
let f9y = (x,y) => fConst9*(x*Math.sin(fConst9*y) + 100) + Math.abs(1 - fConst9)*y;
const fConst10 = 1;
let f10x = (x,y) => fConst10*(x*Math.cos(fConst10*y) + 100) + Math.abs(1 - fConst10)*x;
let f10y = (x,y) => fConst10*(x*Math.sin(fConst10*y) + 100) + Math.abs(1 - fConst10)*y;
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
// var polarCoordinateSpace = new CoordinateSpace(polar,[0,25,10],[0,Math.PI,50]);
// let polar0 = new Field(2);
// polar0.addTransformation([0,f0x],[1,f0y]);
// var polarCoordinateSpace0 = new CoordinateSpace(polar0,[0,200,10],[0,2*Math.PI,50]);
// let polar1 = new Field(2);
// polar1.addTransformation([0,f1x],[1,f1y]);
// var polarCoordinateSpace1 = new CoordinateSpace(polar1,[0,200,10],[0,2*Math.PI,50]);
// let polar2 = new Field(2);
// polar2.addTransformation([0,f2x],[1,f2y]);
// var polarCoordinateSpace2 = new CoordinateSpace(polar2,[0,200,10],[0,2*Math.PI,50]);
// let polar3 = new Field(2);
// polar3.addTransformation([0,f3x],[1,f3y]);
// var polarCoordinateSpace3 = new CoordinateSpace(polar3,[0,200,10],[0,2*Math.PI,50]);
// let polar4 = new Field(2);
// polar4.addTransformation([0,f4x],[1,f4y]);
// var polarCoordinateSpace4 = new CoordinateSpace(polar4,[0,200,10],[0,2*Math.PI,50]);
// let polar5 = new Field(2);
// polar5.addTransformation([0,f5x],[1,f5y]);
// var polarCoordinateSpace5 = new CoordinateSpace(polar5,[0,200,10],[0,2*Math.PI,50]);
// let polar6 = new Field(2);
// polar6.addTransformation([0,f6x],[1,f6y]);
// var polarCoordinateSpace6 = new CoordinateSpace(polar6,[0,200,10],[0,2*Math.PI,50]);
// let polar7 = new Field(2);
// polar7.addTransformation([0,f7x],[1,f7y]);
// var polarCoordinateSpace7 = new CoordinateSpace(polar7,[0,200,10],[0,2*Math.PI,50]);
// let polar8 = new Field(2);
// polar8.addTransformation([0,f8x],[1,f8y]);
// var polarCoordinateSpace8 = new CoordinateSpace(polar8,[0,200,10],[0,2*Math.PI,50]);
// let polar9 = new Field(2);
// polar9.addTransformation([0,f9x],[1,f9y]);
// var polarCoordinateSpace9 = new CoordinateSpace(polar9,[0,200,10],[0,2*Math.PI,50]);
// let polar10 = new Field(2);
// polar10.addTransformation([0,f10x],[1,f10y]);
// var polarCoordinateSpace10 = new CoordinateSpace(polar10,[0,200,10],[0,2*Math.PI,50]);


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
	
	// let coordinateSpace;
	// if (frame > 100) {noLoop()};
	// console.log(frame);
// 	switch(frame % 22) {
// 		case 0:
// 			coordinateSpace = polarCoordinateSpace0;
// 			break;
// 		case 1:
// 			coordinateSpace = polarCoordinateSpace1;
// 			break;
// 		case 2:
// 			coordinateSpace = polarCoordinateSpace2;
// 			break;
// 		case 3:
// 			coordinateSpace = polarCoordinateSpace3;
// 			break;
// 		case 4:
// 			coordinateSpace = polarCoordinateSpace4;
// 			break;
// 		case 5:
// 			coordinateSpace = polarCoordinateSpace5;
// 			break;
// 		case 6:
// 			coordinateSpace = polarCoordinateSpace6;
// 			break;
// 		case 7:
// 			coordinateSpace = polarCoordinateSpace7;
// 			break;
// 		case 8:
// 			coordinateSpace = polarCoordinateSpace8;
// 			break;
// 		case 9:
// 			coordinateSpace = polarCoordinateSpace9;
// 			break;
// 		case 10:
// 			coordinateSpace = polarCoordinateSpace10;
// 			break;
// 		case 11:
// 			coordinateSpace = polarCoordinateSpace10;
// 			break;
// 		case 12:
// 			coordinateSpace = polarCoordinateSpace9;
// 			break;
// 		case 13:
// 			coordinateSpace = polarCoordinateSpace8;
// 			break;
// 		case 14:
// 			coordinateSpace = polarCoordinateSpace7;
// 			break;
// 		case 15:
// 			coordinateSpace = polarCoordinateSpace6;
// 			break;
// 		case 16:
// 			coordinateSpace = polarCoordinateSpace5;
// 			break;
// 		case 17:
// 			coordinateSpace = polarCoordinateSpace4;
// 			break;
// 		case 18:
// 			coordinateSpace = polarCoordinateSpace3;
// 			break;
// 		case 19:
// 			coordinateSpace = polarCoordinateSpace2;
// 			break;
// 		case 20:
// 			coordinateSpace = polarCoordinateSpace1;
// 			break;
// 		case 21:
// 			coordinateSpace = polarCoordinateSpace0;
// 			break;
		
// 	}
	fill('red');
	// coordinateSpace.forEach(function(coordinate) {
		// (coordinate.subSpaceIndices[0] == frame % this.dimensions[0].numPoints ||
		 // coordinate.subSpaceIndices[1] == frame % this.dimensions[1].numPoints)
			// ? fill('red') : fill('yellow');
		// ellipse(coordinate.position[0],coordinate.position[1],13,13);
	// });
	
	space.forEach(function(coordinate) {
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
