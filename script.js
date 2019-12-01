class Transformation {
	constructor(
		// map, mapping, operator, operation, funcList, funcArr, generator, action
		mapping,
		{progressMethod = (mapping.length > 0) ? 'custom' : 'multiplyBefore'} = {}
	) {
		// TODO: require 'custom' instead of guessing it? (stricter validation)
		// TODO: add function validation
		this.mapping = mapping;
		this.numDimensions = mapping().length;
		
		this.options = {
			"progressMethod": progressMethod
		};
		
		// make Transformation immutable
		Object.freeze(this);
	}
	
	static fromFuncArr(funcArr, options) {
		return new Transformation(new Function([], `return [${funcArr}]`), options);
	}
	
	static argList(numDimensions) {
		return [...Array(numDimensions)].map((_, i) => `x${i}`);
	}
	
	static identityElement(numDimensions, dimensionIndex) {
		// TODO: validate 0 <= dimensionIndex < numDimensions
		const argList = Transformation.argList(numDimensions);
		return new Function(argList, `return ${argList[dimensionIndex]}`);
	}
	
	static constantElement(numDimensions, constant) {
		// TODO: validate constant instanceof Number
		return new Function(Transformation.argList(numDimensions), `return ${constant}`);
	}
	
	static rescaleElement(numDimensions, dimensionIndex, [inputInitial, inputFinal, outputInitial, outputFinal]) {
		if (typeof outputFinal === 'undefined') {
			throw new Error('array argument must contain 4 elements: [inputInitial, inputFinal, outputInitial, outputFinal]')
		}
		const argList = Transformation.argList(numDimensions);
		// return (x-a)*(d-c)/(b-a)+c;
		return new Function(argList, `return (${argList[dimensionIndex]} - ${inputInitial}) * (${outputFinal - outputInitial}) / (${inputFinal - inputInitial}) + ${outputInitial}`);
	}
	
	static rescale(...inputOutputArrs) {
		// inputOutputArr ~ [inputInitial, inputFinal, outputInitial, outputFinal] OR []
		const numDimensions = inputOutputArrs.length;
		const funcArr = inputOutputArrs.map((inputOutputArr, i) => {
			if (inputOutputArr.length === 0) {
				return Transformation.identityElement(numDimensions, i);
			} else {
				return Transformation.rescaleElement(numDimensions, i, inputOutputArr);
			}
		});
		// [inputInitial, inputFinal, outputInitial, outputFinal]
		return Transformation.fromFuncArr(funcArr, {progressMethod: 'multiplyAfter'});
	}
	
	static identity(numDimensions, ...constantKeyPairs) {
		// elementKeyPairs.length <= numDimensions with each key < numDimensions
		// if (!(elementKeyPairs instanceof Map)) elementKeyPairs = new Map(elementKeyPairs);
		const constantKeyPairsMap = new Map(constantKeyPairs);
		return Transformation.fromFuncArr([...Array(numDimensions)].map((_,i) => {
			if (constantKeyPairsMap.has(i)) {
				return Transformation.constantElement(numDimensions, constantKeyPairsMap.get(i));
			} else {
				return Transformation.identityElement(numDimensions, i);
			}
		}), {progressMethod: 'multiplyAfter'});
	}
	
	calcMapping(position, progress, point) {
		return this.mapping(progress, point).map(mappingElement => mappingElement.call(this, ...position));
	}
	
	calc(position, progress = 1, point) {
		// TODO: require progress value for custom progressMethod?
		// when progress = 1, 'multiplyBefore' and 'multiplyAfter' calculations reduce to this.calcMapping(), so perform that operation when possible to avoid unnecessary operations
		if (progress === 1 && this.options.progressMethod !== 'custom') {
			return this.calcMapping(...arguments);
		} else {
			let posProgressed;
			switch (this.options.progressMethod) {
				case 'multiplyBefore':
					// f(progress*x0, progress*x1, ..., progress*x[n-1])
					// multiply components by progress, then evaluate
					posProgressed = this.calcMapping(position.map(x_i => progress*x_i), progress, point);
					break;
				case 'multiplyAfter':
					// progress*mapping(x0,x1,...,x[n-1])
					// evaluate with position components, then multiply by progress
					posProgressed = this.calcMapping(...arguments).map(x_i => progress*x_i);
					break;
				case 'custom':
					// multiply by progress as defined by user with extra mapping argument
					posProgressed = this.calcMapping(...arguments);
					break;
			}
			// progress*T(x) + (1-progress)*x
			return position.map((x_i, i) => posProgressed[i] + (1-progress)*x_i);
		}
	}
	
	curriedCalc(progress) {
		return (position, point) => {
			return this.calc(position, progress, point);
		}
	}
}

class Vector {
	constructor(position) {
		this.position = position;
	}
	
	// iterates components of this.position
	*[Symbol.iterator]() {
		for (let component of this.position) {
			yield component;
		}
	}
	
	// getters
	get numDimensions() {
		return this.position.length;
	}
	
	clone() {
		return new Vector([...this.position]);
	}
	
	// updates this.position and returns this
	transform(transformations, {progress} = {}) {
		// TODO: validation for progress between [0,1]
		this.position = transformations.reduce((acc, trans, i) => {
			return trans.calc(acc, (i > 0) ? 1 : progress, this);
		}, this.position);
		return this;
	}
	
	// transforms clone of this and returns Point clone
	transformClone(transformations, {progress} = {}) {
		return this.clone().transform(transformations, {progress: progress});
	}
}

class Point extends Vector {
	constructor(position, dataObject = {}) {
		super(position);
		this.data = dataObject;
	}
	
	clone() {
		return new Point([...this.position], Object.assign({}, this.data));
	}
}

class Curve {
	constructor(points, dataObject = {}) {
		// TODO: valiation for array of points
		this.points = points;
		this.data = dataObject;
	}
	
	// iterates points of this.points
	*[Symbol.iterator]() {
		for (let point of this.points) {
			yield point;
		}
	}
}

class Dimension {
	constructor(size, initial, final = initial) {
		// TODO: okay to use arguments param?
		Dimension.validate(...arguments);

		this.size = size;
		this.initial = initial;
		this.final = final
		
		this.stepSize = (this.size !== 1) ? (this.final - this.initial) / (this.size - 1) : 0;
		this.elements = [...Array(this.size)].map((_, i) => this.initial + i*this.stepSize);
		
		this.min = Math.min(this.initial, this.final);
		this.max = Math.max(this.initial, this.final);
		
		// make Dimension immutable
		Object.freeze(this);
	}

	// TODO: use static validation method for all classes? (check proper way to pass in arguments - what if something changes and the validation breaks?)
	static validate(size, initial, final) {
		// check if numPoints is an integer value
		let hasIntegerSize = size % 1 === 0;
		if (!hasIntegerSize) {
			throw new Error('Dimension Error: size must be an integer value');
		}
	}
	
	// map(a, b) {
	// 	// return ((x-min)*(b-a)/(max-min)+a);
	// 	return new Dimension(this.size, a, b);
	// }
	
	// All 'extend' methods return a new Dimension object
	//// extend a given number of steps in both directions
	extend(steps = 1) {
		return new Dimension(this.size + 2*steps,
									this.initial - steps*this.stepSize,
								   this.final + steps*this.stepSize);
	}
	//// extend a given number of steps before this.initial
	extendBackward(steps = 1) {
		return new Dimension(this.size + steps,
									this.initial - steps*this.stepSize,
								   this.final);
	}
	//// extend a given number of steps after this.final
	extendForward(steps = 1) {
		return new Dimension(this.size + steps,
									this.initial,
								   this.final + steps*this.stepSize);
	}
	
	getRescaledDimension([outputInitial, outputFinal], progress = 1) {
		// return (x-a)*(d-c)/(b-a)+c;
		const inputRange = this.final - this.initial;
		const outputRange = outputFinal - outputInitial;
		return new Dimension(this.size,
									progress*outputInitial + (1-progress)*this.initial,
									progress*outputFinal + (1-progress)*this.final
		);
	}
	
	getRescaledElements([outputInitial, outputFinal], progress = 1) {
		// return (x-a)*(d-c)/(b-a)+c;
		const inputRange = this.final - this.initial;
		const outputRange = outputFinal - outputInitial;
		return this.elements.map((el,i) => {
			return progress*((el - this.initial)*(outputRange)/(inputRange) + outputInitial) + (1-progress)*el;
		});
	}
}

class Space {
	constructor(...dimensions) {
		this.dimensions = dimensions.map(dim => {
			if (dim instanceof Dimension) {
				return dim; 
			} else if (dim instanceof Array) {
				return new Dimension(...dim);
			} else {
				throw new Error('Space Error: arguments must be either Dimension or Array objects');
			}
		});
		
		this.numDimensions = this.dimensions.length;
		this.min = this.dimensions.map(dim => dim.min);
		this.max = this.dimensions.map(dim => dim.max);
		this.size = this.dimensions.map(dim => dim.size);
		this.numPoints = this.size.reduce((acc, n) => acc * n, 1);
		this.repeatArr = this.size.map((_, i, arr) => {
			return arr.reduce((repeatVal, n, j) => {
				return repeatVal *= (j > i) ? n : 1;
			}, 1);
		});
		
		this.vectors = [...Array(this.numPoints)];
		this.stepIndexes = [...Array(this.numPoints)].map(() => [...Array(this.numDimensions)]);
		for (let i = 0; i < this.numPoints; i++) {
			let position = [...Array(this.numDimensions)];
			this.dimensions.forEach((dim, j) => {
				const stepIndex = Math.floor(i / this.repeatArr[j]) % dim.size;
				
				this.stepIndexes[i][j] = stepIndex;
				position[j] = dim.elements[stepIndex];
			})
			this.vectors[i] = new Vector(position);
		}

		// make Space immutable
		Object.freeze(this);
	}
}

class Field {
	constructor(space, {transformations = [], domain = [], data = {}} = {}) {
		if (space instanceof Space) {
			this.space = space;
		} else if (space instanceof Array) {
			this.space = new Space(...space);
		} else {
			throw new Error('Field Error: first argument must be either Space or Array object');
		}
		
		this.points = this.space.vectors.map((pos, i) => new Point(pos, {'field': this, 'fieldIndex': i, 'fieldStepIndexes': this.space.stepIndexes[i]}));

		// this.min = Array(this.numDimensions).fill(Infinity);
		// this.max = Array(this.numDimensions).fill(-Infinity);
		// this.updateMinMax();
		
		this.data = data;
		
		this.positions = this.space.vectors.map(pos => [...pos]);
		
		// system, form, process, layout, setup
		// this.system = [{transformations: [null], progress: null, dimensions: this.space.dimensions}];
		this.system = [];
		// this.domain = this.dimensions.map(dim => [dim.initial, dim.final]);
		
		this.transformations = [];
		// this.transform adds any transformations to this.transformations array
		if (transformations.length > 0) {
			this.transform(transformations);
		}
	}
	
	static clone(self) {
		let fieldClone = Object.assign(Object.create(Object.getPrototypeOf(self)), self);
		fieldClone.points = fieldClone.points.map(point => point.clone());
		fieldClone.system = fieldClone.system.slice(0);
		fieldClone.transformations = fieldClone.transformations.slice(0);
		// TODO: add deep clone support for arrays, possibly second-level object literals
		fieldClone.data = Object.assign({}, self.data);
		return fieldClone;
	}
	
	// iterates points of this.points
	*[Symbol.iterator]() {
		for (const point of this.points) {
			yield point;
		}
	}
	
	// set system(param = {}) {
	// 	const {transformations, progress, dimensions} = param;
	// 	this.system.push(param);
	// }
	// get system() {
	// 	return this._system = this._system ||
	// 		[{transformations: [null], progress: null, dimensions: this.space.dimensions}];
	// }
	
	// lazy getters
	get componentCurves() {
		return this._componentCurves = this._componentCurves ||
			this.size.map((numPoints, i, arr) => {
				if (numPoints === 1) {
					return 0;
				} else {
					return arr.reduce((acc, numPoints, j) => {
						return acc *= (i !== j) ? numPoints : 1;
					}, 1);
				}
			});
	}
	get numCurves() {
		return this._numCurves = this._numCurves ||
			this.componentCurves.reduce((acc, numComponentCurves) => acc + numComponentCurves, 0);
	}
	
	// Space getters
	get dimensions() {return this.space.dimensions}
	get numDimensions() {return this.space.numDimensions}
	get size() {return this.space.size}
	get numPoints() {return this.space.numPoints}
	
	transformationIdentity() {
		return Transformation.identity(this.numDimensions);
	}
	transformationCollapse(componentKeyPairs) {
		return Transformation.identity(this.numDimensions, componentKeyPairs);
	}
	transformationRescale(...outputArrs) {
		if (outputArrs.length !== this.numDimensions) {
			throw new Error('number of arguments must be same as this.numDimensions');
		}
		const mapArgs = outputArrs.map((outputArr, i) => {
			// TODO: validate outputArr length, either 0 or 2
			// TODO: add option for when min and max need to exclude control points
			if (outputArr.length === 0) return [];
			return [this.space.min[i], this.space.max[i], outputArr[0], outputArr[1]];
		});
		return Transformation.rescale(...mapArgs);
	}
	
	collapse(componentKeyPairs, progress) {
	// collapse(dimensionIndex, constantComponent) {
	// 	for (let i = 0; i < this.numPoints; i++) {
	// 		const compIndices = this.componentIndices[i];
	// 		if (compIndices[dimensionIndex] !== constantComponent) {
	// 			const index = this.compsToIndex(compIndices.map((compIndex, j) => (j === dimensionIndex ? constantComponent : compIndex)));
	// 			this.points[i].position = [...this.points[index].position];
	// 		}
	// 	}
	// 	return this;
		return this.transform(this.transformationCollapse(componentKeyPairs), {progress: progress});
	}
	collapseMap(componentKeyPairs, progress) {
		return Field.clone(this).collapse(componentKeyPairs, progress);
	}
	// extrude() 
	
	getSystemInputTrans(inputRange) {
		// TODO: validate that inputRange.length = this.numDimensions
		const rangeEntries = this.system.filter(obj => obj.inputRange !== null);
		// true inputRange is the first added to the system
		if (rangeEntries.length === 0) {
			return this.transformationRescale(...inputRange);
		} else {
			const inputOutputArrs = rangeEntries.map((obj, i, arr) => {
				return inputRange.map((_, j) => {
					if (obj.inputRange[j].length === 0) {
						return [];
					} else {
						let inputPrev = [this.space.min[j], this.space.max[j]];
						for (let k = i; k > 0; k--) {
							const rangePrev = arr[k-1].inputRange[j];
							if (rangePrev.length === 0) {
								continue;
							} else if (rangePrev.length > 0) {
								inputPrev = rangePrev;
								break;
							} else {
								break;
							}
						}
						return [...inputPrev, ...inputRange[j]];
					}
				});
			});
			return Transformation.rescale(...inputOutputArrs);
		}
	}
	
	// transforms this.points and adds transformations to this.transformations array, returns this
	transform(transformations, {progress = 1, inputRange = null} = {}) {
		if (inputRange) {
			// TODO: use try/except
			// this.validateInputRange(inputRange)
			if (inputRange instanceof Array) {
				if (inputRange.length !== this.numDimensions) {
					throw new Error('inputRange must have length equal to this.numDimensions');
				} else {
					inputRange.forEach((range,i) => {
						if (range instanceof Dimension) {
							if (range.size !== this.size[i]) {
								throw new Error('each Dimension element of inputRange must have the same size of the corresponding element in this.size: inputRange[i].size === this.size[i]');
							}
						} else if (range instanceof Array) {
							if (range.length < 0 || range.length > 2) {
								throw new Error('each Array element of inputRange must have a length from 0 to 2');
							}
						} else {
							throw new Error('each element of inputRange must be either Dimension or Array object');
						}
					})
				}
			} else {
				throw new Error('inputRange must be an Array');
			}
		}
		
		this.system.push({
			transformations: transformations,
			progress: progress,
			inputRange: inputRange,
			inputTrans: (inputRange) ? this.getSystemInputTrans(inputRange) : null,
			systemIndex: this.system.length
		});
		
		// set variable so filter isn't performed for every point
		// entries with inputRange will also have inputTrans
		const inputRangeEntries = this.system.filter(obj => obj.inputRange !== null);
		const lastEntryHasRange = this.system[this.system.length - 1].inputRange !== null;
		this.points.forEach((point, i) => {
			const inputPosition = inputRangeEntries.reduce((position, obj, j, arr) => {
				// use progress when obj is last entry in transArr AND when last entry in this.system has inputRange
				const inputTransProgress = (lastEntryHasRange && j === arr.length - 1) ? progress : 1;
				return obj.inputTrans.calc(position, inputTransProgress);
			}, this.positions[i]);
			
			point.position = this.system.reduceRight((position, obj, j, sys) => {
				// use progress when obj is last in entry in this.system
				const transProgress = (j === sys.length - 1) ? progress : 1;
				return obj.transformations.reduceRight((pos, trans) => {
					return trans.calc(pos, transProgress, point, this);
				}, position);
			}, inputPosition);
		});
		
		return this;
	}
		
	// calls transform method on clone of this, returns transformed clone
	transformClone(transformations, {progress, inputRange} = {}) {
		return Field.clone(this).transform(transformations, {progress: progress, inputRange: inputRange});
	}
	
	getCurveMesh({hideOuterCurves = false} = {}) {
		const options = {
			"hideOuterCurves": hideOuterCurves
		};
		
		const dimensionless = this.size.map(numPoints => numPoints === 1);
		// TODO: add methods to retrieve curve properties from points and vice versa
		// array of component-based multiplier arrays used to place points into appropriate curve sets
		const curveMultipliers = this.size.map((_, dimensionIndex, size) => {
			//////////////////
			if (dimensionless[dimensionIndex]) {return null};
			
			// remove element of current component, then remove last element
			let multipliers = size.filter((_,i) => i !== dimensionIndex);
			multipliers.pop();
			// multiply each element by all elements preceding it
			for (let i = 1; i < multipliers.length; i++) {
				multipliers[i] *= multipliers[i-1];
			}
			// place 1 at beginning of array, then add value of 0 at index of current component
			multipliers.unshift(1);
			multipliers.splice(dimensionIndex, 0, 0);
			
			//////////////////
			if (dimensionless.includes(true)) {
				// TODO: undefined is probably not the right thing to assign here, should be null
				multipliers.forEach((_,i,arr) => {if (dimensionless[i]) arr[i] = undefined});
			}
			
			return multipliers;
		});
		
		// array of curve sets for each dimension (x-curveSet, y-curveSet, z-curveSet, ...)
		let curveMesh = this.size.map((numPoints, dimIndex, size) => {
			// array of curves for each curve set (x-curve_0, x-curve_1, ...)
			return [...Array(this.componentCurves[dimIndex])].map((_, curveIndex, curveArr) => {
				const multipliers = curveMultipliers[dimIndex];
				let constantCoordinateComponents = {};
				for (let i = 0; i < multipliers.length; i++) {
					// component where multiplier === 0 is curve's variable component
					// TODO: add surface where multiple number of components can vary
					if (multipliers[i] !== 0) {
						constantCoordinateComponents[i] = (multipliers[i]) ? (Math.floor(curveIndex / multipliers[i]) % curveArr.length) % size[i] : 0;
					}
				}
				return new Curve([...Array(numPoints)], {'constantCoordinateComponents': constantCoordinateComponents});
			});
		});
		
		// fill curves with points - curves are filled after creation of curveMesh array for performance reasons
		//// only need to iterate this.points 1 time, instead of {this.numDimensions} times
		for (let i = 0; i < this.numPoints; i++) {
			const point = this.points[i];
			// point gets added once to each dimension of curve sets
			//// point will be part of n curves, where n = this.numDimensions = point.data.fieldComponents.length
			// this.space.getStepIndices(i).forEach((dimensionIndex, j, arr) => {
			this.space.stepIndexes[i].forEach((dimensionIndex, j, arr) => {
				//////////////////
				if (dimensionless[j]) return;
				// convert point's fieldComponets to curve set index 
				const curveIndex = arr.reduce((acc, componentVal, k) => {
						let multiplier = curveMultipliers[j][k];
						if (!multiplier) multiplier = 0;
						return acc += multiplier*componentVal;
					}
			  	,0);

				curveMesh[j][curveIndex].points[dimensionIndex] = point;
			});
		}
		
		// TODO: add marker to curve data (display: false) instead of removing from array? if not, rename to 'removeOuterCurves'
		if (options.hideOuterCurves) {
			curveMesh = curveMesh.map((curveSet) => {
				return curveSet.filter((curve) => {
					let isInnerCurve = true;
					for (let [key, value] of Object.entries(curve.data.constantCoordinateComponents)) {
						if ((value === 0 || value === this.size[key] - 1) && !dimensionless[key]) {
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
	getAnimation(numFrames, keyframes) {
		return new FieldAnimation(this, numFrames, keyframes);
	}
	getPoints(...constantComponents) {
		const map = new Map(constantComponents);
		let arr = [];
		for (const [point, i] of this) {
			let match = true;
			for (const [key, value] of map) {
				if (this.componentIndices[i][key] !== value) {
					match = false;
				}
			}
			if (match) arr.push(point);
		}
		return arr;
	}
	getPosition(index) {
		if (index < 0 || index >= this.numPoints) {
			throw new Error('position index out of range');
		}
		
	}
}

// TODO: REFACTOR
// TODO: add render method?
class FieldAnimation {
	constructor(field, numFrames, keyframes) {
		this.field = Field.clone(field);
		this.numFrames = numFrames;
		// TODO: keyframes validation, possibly separate object
		this.keyframes = keyframes;
		// TODO: combine frameSet and frames, using frame object with 'keyframe' property
		this.frameSet = [...Array(keyframes.length-1)];
		// flattened version of frameSet
		this.frames = [];
		
		const startTransformations = this.keyframes[0].transformations;
		let currentField = (!startTransformations || startTransformations.length === 0)
			? this.field
			: this.field.transform(startTransformations);
		
		// populate this.frameSet and this.frames
		for (let i = 1; i < this.keyframes.length; i++) {
			const keyframePrev = this.keyframes[i-1];
			const keyframe = this.keyframes[i];
			const numFramesInFrameSet = Math.round((keyframe.progress - keyframePrev.progress) / 100 * numFrames);
			const stepInterval = 1/(numFramesInFrameSet-1);
			const framesArr = [...Array(numFramesInFrameSet)].map((_, i) => currentField.transformClone(keyframe.transformations, {progress: i*stepInterval, inputRange: keyframe.inputRange}));
			
			this.frameSet[i-1] = framesArr;
			this.frames.push(...framesArr);
			
			if (i !== this.keyframes.length - 1) {
				currentField = currentField.transform(keyframe.transformations, {inputRange: keyframe.inputRange});
			}
		}
	}
	
	// iterates frames of this.frames
	*[Symbol.iterator]() {
		for (let frame of this.frames) {
			yield frame;
		}
	}
}

class PointAnimation {
	constructor(numFrames, point, keyframes) {
		this.numFrames = numFrames;
		this.point = point.clone();
		// TODO: keyframes validation, possibly separate object
		this.keyframes = keyframes;
		// TODO: combine frameSet and frames, using frame object with 'keyframe' property
		this.frameSet = [...Array(keyframes.length-1)];
		// flattened version of frameSet
		this.frames = [];
		
		const startTransformations = this.keyframes[0].transformations;
		let currentPoint = (!startTransformations || startTransformations.length === 0)
			? this.point
			: this.point.transform(startTransformations);
		
		// populate this.frameSet and this.frames
		for (let i = 1; i < this.keyframes.length; i++) {
			const keyframePrev = this.keyframes[i-1];
			const keyframe = this.keyframes[i];
			const numFramesInFrameSet = Math.round((keyframe.progress - keyframePrev.progress) / 100 * numFrames);
			const stepInterval = 1/(numFramesInFrameSet-1);
			const framesArr = [...Array(numFramesInFrameSet)].map((_, i) => currentPoint.transformClone(keyframe.transformations, {progress: i*stepInterval}));
			
			this.frameSet[i-1] = framesArr;
			this.frames.push(...framesArr);
			
			if (i !== this.keyframes.length - 1) {
				currentPoint = currentPoint.transform(keyframe.transformations);
			}
		}
	}
	
	// iterates frames of this.frames
	*[Symbol.iterator]() {
		for (let frame of this.frames) {
			yield frame;
		}
	}
}

////////////////////////////////////////////////////////
////////////////////////////////////////////////////////
////////////////////////////////////////////////////////
console.log('-------');

// scale factors
const scaleY = 60;
const scaleZ = 30;

// Transformations
// const terrain = new Transformation((step) => [
// 	(x,y,z) => step*x + step*50*this.data.randomVal,
// 	(x,y,z) => step*y,
// 	(x,y,z) => step*z
// ]);
//// 3D Spherical
const transSpherical = new Transformation(() => [
	(x,y,z) => x*Math.cos(y)*Math.sin(z),
	(x,y,z) => x*Math.sin(y)*Math.sin(z),
	(x,y,z) => x*Math.cos(z)
] // , {scale: [1, 1/scaleY, 1/scaleZ]}
);

//// 2D Radial
const xFunc = (s) => (x,y) => s*x*Math.cos(s*y);
const yFunc = (s) => (x,y) => s*x*Math.sin(s*y);
const transRadial = new Transformation(step => [xFunc(step), yFunc(step)]);
const transScale = new Transformation((step) => [
	(x,y) => step*(x/2 + 50),
	(x,y) => step*y/2
]);
const transScale1 = new Transformation(() => [
	(x,y) => x*(-4),
	(x,y) => y/2
]);
const transWavy = new Transformation((s) => [
	(r,theta) => s*r + s*50*Math.sin(s*2*Math.PI*2) + s*Math.cos(s*theta*9)*20,
	(r,theta) => s*theta
]);
//// 3D Cylindrical
// const transCylindrical = new Transformation((x,y,z) => [x*Math.cos(y), x*Math.sin(y), z], {scale: [1, 2/scaleY, 1]});

// Field
const dimR = new Dimension(15, 0, 250);
const dimTheta = new Dimension(70, 0, 2*Math.PI);
// const dimTheta = new Dimension(10, 0, 10*2*Math.PI).getRescaledDimension([0,2*Math.PI],.5);
const dimB = new Dimension(8, -200, 200);
const dimC = new Dimension(3, -100, 100);
// let space3D = new Space(dimX.extend(), dimY.extend(), dimZ.extend());
// let field3D = new Field([dimB.extend(), dimB.extend(), dimC.extend()]);
let field3D = new Field([
	new Dimension(5, 0, 200).extend(),
	new Dimension(9, 0, scaleY*Math.PI).extend(),
	new Dimension(9, 0, scaleZ*2*Math.PI).extend()
]);
let field3DCollapsed = new Field([
	new Dimension(5, 150).extend(),
	new Dimension(8, 0).extend(),
	new Dimension(8, 0, scaleZ*2*Math.PI).extend()
]);

// console.log(dimTheta.elements);
// console.log(dimTheta.getRescaledElements([50,100], .5));
// console.log(dimTheta.getRescaledDimension([50,100], .5).elements);
// let field2D = new Field([dimR.extend(), dimTheta.extend()]);
let field2D = new Field([dimR, dimTheta]);
let field2D_mesh = Field.clone(field2D);
console.log(field2D);

let extrudeX = new Transformation((step) => [
	(x,y) => step*(x*50-c),
	(x,y) => step*y
], {scale: [1, 2]});
const c = 49;
const d = 51;
let isEdgePoint = (p) => p.data.fieldStepIndexes.some((el,i) => el === 0 || el === (p.data.field.size[i] - 1));
let collapseX = new Transformation((step,point) => [
	function(x,y) {
		const field = point.data.field;
		// const points = field.points.filter(p => !isEdgePoint(p));
		const a = field.space.min[0];
		// const min = field.dimensions[0].initial;
		const b = field.space.max[0];
		return step*((x-a)*(d-c)/(b-a)+c);
	},
	(x,y) => y
]);

// Animation
const numFrames = 400;
// TODO: update so progress gets ordered automatically 
let animation2D = field2D.getAnimation(numFrames, [
	{progress: 0},
	{progress: 25, transformations: [transRadial]},
	{progress: 50, transformations: [transWavy]},
	// {progress: 70, transformations: [transScale1]},
	// {progress: 65, transformations: [collapseX]},
	// {progress: 100, transformations: [extrudeX]}
	{progress: 75, transformations: [transWavy,transScale], inputRange: [[0,300],[-2*Math.PI,0]]},
	{progress: 100, transformations: [field2D.transformationRescale([],[-4*Math.PI,0])]}
]);
console.log(animation2D.frames.slice(-1)[0].system);
let animation3D = field3D.getAnimation(numFrames, [
	{progress: 0},
	// {progress: 0, transformations: [transSpherical]},
	{progress: 20, transformations: [field3D.transformationCollapse([[1,0]])]},
	// {progress: 60, transformations: [collapseX]},
	// {progress: 100, transformations: [extrudeX]}
]);
let animation3DCollapsed = field3DCollapsed.getAnimation(numFrames, [
	{progress: 0, transformations: [transSpherical]},
	{progress: 50, transformations: [extrudeX]},
	{progress: 100, transformations: [field3DCollapsed.transformationCollapse([[1,0]])]}
]);

// Curves
let animationCurveSet2D = animation2D.frames.map(field => field.getCurveMesh({"hideOuterCurves": true}));
// let animationCurveSet3D = animation3DCollapsed.frames.map(field => field.getCurveMesh({"hideOuterCurves": true}));
let animationCurveSet3D = animation3D.frames.map(field => field.getCurveMesh({"hideOuterCurves": true}));
let mesh = field2D_mesh
	.transformClone(
		[transRadial],
		{progress: 1, inputRange: [[],[0,2*Math.PI]]}
	)
	// .transformClone(
	// 	[field2D.transformationRescale([],[0,2*Math.PI])],
	// 	{progress: 0}
	// )
	// {progress: 1, inputRange: [[],[0,2*Math.PI]]})
	.getCurveMesh({"hideOuterCurves": true});

const fps = 60;
const framesTotal = numFrames;
const frameRepeat = 1;
let rates = [...Array(numFrames-1)];
let drawCurve;
let canvas;
/// P5JS ///
function setup() {
	frameRate(fps);  //default value is 60
	canvas = createCanvas(700, 550);
	// NOTE: +y points downwards
	drawCurve = (curve) => {
		noFill();
		beginShape();
		for (const point of curve) {
			curveVertex(...point.position);
			// vertex(...point.position);
		}
		endShape();
	};
	// noLoop();
}

function draw() {
	translate(canvas.width/2,canvas.height/2);
	if (frameCount == 1) console.time('draw');
	
	const frame = Math.floor(frameCount / frameRepeat);
	let animationIndex = frame % framesTotal;
	if ((frame % (2*framesTotal)) > (framesTotal-1)) {
		animationIndex = Math.abs((framesTotal-1) - animationIndex);
	}

	colorMode(HSB);
	// background(...animationSet[animationIndex].data.color);
	background('#fafafa');
	// rotateX(frameCount * 0.01);
	// rotateX(1);
	// rotateY(frameCount * -0.01);
	// rotateZ(frameCount * -0.01);
	// rotateX(Math.PI/2 - frameCount*.0015);
	// rotateZ(-frameCount*.001);
	// rotateY(.4);
	// rotateZ(.2);
	
	let currentCurveSet2D = animationCurveSet2D[animationIndex];
	let currentCurveSet3D = animationCurveSet3D[animationIndex];
	
	// // x-curves
	stroke('orange');
	// mesh[0].forEach(curve => drawCurve(curve));
	currentCurveSet2D[0].forEach(curve => drawCurve(curve));
	// currentCurveSet3D[0].forEach(curve => drawCurve(curve));
	// // y-curves
	stroke('green');
	// mesh[1].forEach(curve => drawCurve(curve));
	currentCurveSet2D[1].forEach(curve => drawCurve(curve));
	// currentCurveSet3D[1].forEach(curve => drawCurve(curve));
	// z-curves
	// stroke('purple');
	// mesh[2].forEach(curve => drawCurve(curve));
	// currentCurveSet3D[2].forEach(curve => drawCurve(curve));
	
	
	// // all points
	// normalMaterial();
	stroke('#fff');
	fill('black');
	// sphere(8);
	circle(0,0,8);
	// noStroke();
	// fill('purple');
	// for (const p of field3D) {
		// push();
		// translate(...p.position);
		// sphere(5);
		// circle(...p.position,8);
		// pop();
	// }
	
	rates[animationIndex-1] = frameRate();
	if (animationIndex == framesTotal-1) {
		console.timeEnd('draw');
		const averageFPS = rates.reduce((acc, el) => acc+=el, 0) / rates.length;
		console.log(Math.round(averageFPS) + ' fps');
		noLoop();
	}
}
