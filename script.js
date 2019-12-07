const compose = (...fns) => (...args) => fns.reduceRight((res, fn) => [fn.call(null, ...res)], args)[0];
function curry(func) {
  return function curried(...args) {
    if (args.length >= func.length) {
      return func.apply(this, args);
    } else {
      return function(...args2) {
        return curried.apply(this, args.concat(args2));
      }
    }
  };
}
function calcInputPosition(progress, system, initialPosition) {
	// return (progress) => {
		const lastEntryHasDomain = !!(system[system.length - 1].domain);
		return system
			.filter(entry => entry.domain)
			.reduce((pos, entry, i, sysFiltered) => {
				// use progress when last entry in system has domain AND when i corresponds to last entry in filtered system
				const transProgress = (lastEntryHasDomain && i === sysFiltered.length - 1) ? progress : 1;
				return entry.inputTrans.calc(pos, transProgress);
			}, initialPosition);
	// }
}
const curriedCalcInputPosition = curry(calcInputPosition);
function calcPointPosition(progress, field, point, inputPosition) {
	return field.system.reduceRight((position, entry, i) => {
		// use progress for last entry in system
		const transProgress = (i === field.system.length - 1) ? progress : 1;
		return entry.transformations.reduceRight((pos, trans) => {
			return trans.calc(pos, transProgress, point, field);
		}, position);
	}, inputPosition);
}
const curriedCalcPointPosition = curry(calcPointPosition);

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
		// return new Function(argList, `return (arguments[${dimensionIndex}] - ${inputInitial}) * (${outputFinal - outputInitial}) / (${inputFinal - inputInitial}) + ${outputInitial}`);
	}
	
	static rescale(...inputOutputArrs) {
		// inputOutputArr ~ [inputInitial, inputFinal, outputInitial, outputFinal] OR []
		const numDimensions = inputOutputArrs.length;
		// console.log(...inputOutputArrs);
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
			// (1-progress)*x + progress*T(x)
			return position.map((x_i, i) => (1-progress)*x_i + posProgressed[i]);
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
	transform(transformations, progress) {
		// TODO: validation for progress between [0,1]
		this.position = transformations.reduce((acc, trans, i) => {
			return trans.calc(acc, (i > 0) ? 1 : progress, this);
		}, this.position);
		return this;
	}
	
	// transforms clone of this and returns Point clone
	transformClone(transformations, progress) {
		return this.clone().transform(...arguments);
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
		if (size === 1 && final !== initial) {
			throw new Error('Dimension Error: final must equal initial when size is 1');
		} 

		this.size = size;
		this.initial = initial;
		this.final = final
		
		this.interval = (this.size === 1) ? 0 : (this.final - this.initial) / (this.size - 1);
		// this.interval = (this.size === 1) ? 0 : (this.final - this.initial) / (this.size - 1);
		this.elements = [...Array(this.size)].map((_, i) => this.initial + i*this.interval);
		
		this.min = Math.min(this.initial, this.final);
		this.max = Math.max(this.initial, this.final);
		
		// make Dimension immutable
		Object.freeze(this);
	}
	
	// All methods return a new Dimension object
	//// extend a given number of elements in both directions
	extend(elements = 1) {
		return new Dimension(this.size + 2*elements,
									this.initial - elements*this.interval,
								   this.final + elements*this.interval);
	}
	//// extend a given number of elements before this.initial
	extendBackward(elements = 1) {
		return new Dimension(this.size + elements,
									this.initial - elements*this.interval,
								   this.final);
	}
	//// extend a given number of elements after this.final
	extendForward(elements = 1) {
		return new Dimension(this.size + elements,
									this.initial,
								   this.final + elements*this.interval);
	}
	rescale([outputInitial, outputFinal], progress = 1) {
		// (x - this.initial) * (outputFinal - outputInitial) / (this.final - this.initial) + outputInitial;
		return new Dimension(this.size,
									(1-progress)*this.initial + progress*outputInitial,
									(1-progress)*this.final + progress*outputFinal
		);
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
		this.numPoints = this.dimensions.reduce((acc, dim) => acc * dim.size, 1);
		
		this.positions = new Float32Array(this.numPoints*this.numDimensions);
		this.compSets = new Uint32Array(this.numPoints*this.numDimensions);
		const repeatArr = this.dimensions.map((_, i, arr) => {
			return arr.reduce((acc, dim, j) => acc *= (j > i) ? dim.size : 1, 1);
		});
		for (let i = 0; i < this.numPoints; i++) {
			this.dimensions.forEach((dim, j) => {
				const component = Math.floor(i / repeatArr[j]) % dim.size;
				const flatIndex = this.getFlatIndex(i,j);
				this.compSets[flatIndex] = component;
				this.positions[flatIndex] = dim.elements[component];
			})
		}

		// make Space immutable
		Object.freeze(this);
	}
	
	getPointIndex(flatIndex) {
		// corresponds to i in arr2D[i][j]
		if (flatIndex < 0 || flatIndex >= this.numPoints*this.numDimensions) {
			throw new Error(`flatIndex out of range: must be between [0,${this.numPoints*this.numDimensions - 1}]`);
		}
		return Math.floor(flatIndex / this.numDimensions);
	}
	getDimensionIndex(flatIndex) {
		// corresponds to j in arr2D[i][j]
		if (flatIndex < 0 || flatIndex >= this.numPoints*this.numDimensions) {
			throw new Error(`flatIndex out of range: must be between [0,${this.numPoints*this.numDimensions - 1}]`);
		}
		return flatIndex % this.numDimensions;
	}
	getFlatIndex(pointIndex, dimensionIndex = 0) {
		if (pointIndex < 0 || pointIndex >= this.numPoints) {
			throw new Error(`pointIndex out of range: must be between [0,${this.numPoints - 1}]`);
		}
		if (dimensionIndex < 0 || dimensionIndex >= this.numDimensions) {
			throw new Error(`dimensionIndex out of range: must be between [0,${this.numDimensions - 1}]`);
		}
		return pointIndex*this.numDimensions + dimensionIndex;
	}
	
	getPosition(pointIndex) {
		// subarray creates a new view on the existing buffer, as opposed to slice, which copies the selection
		const startIndex = this.getFlatIndex(pointIndex);
		return Array.from(this.positions.subarray(startIndex, startIndex + this.numDimensions));
	}
	getCompSet(pointIndex) {
		// subarray creates a new view on the existing buffer, as opposed to slice, which copies the selection
		const startIndex = this.getFlatIndex(pointIndex);
		return Array.from(this.compSets.subarray(startIndex, startIndex + this.numDimensions));
	}
}

function mapComp(val, a, b, c, d) {
	return (val - a) * (d - c) / (b - a) + c;
}
// mapComp(mapComp(mapComp(v, a,b, c,d), c,d, e,f), e,f, g,h);

class SystemEntry {
	constructor(transformations, {progress = 1, domain = null} = {}) {
		if (!(transformations instanceof Array) || transformations.length === 0) {
			throw new Error('First argument must be instanceof Array with at least one element');
		}
		if (transformations.some(trans => !(trans instanceof Transformation))) {
			throw new Error('Each element of transformations array must be instanceof Transformation');
		}
		
		this.numDimensions = transformations[0].numDimensions;
		if (transformations.length > 1 && transformations.some(trans => trans.numDimensions !== this.numDimensions)) {
			throw new Error('Each Transformation must have same value for numDimensions');
		}
		this.transformations = transformations;
		
		this.progress = progress;
		
		if (domain !== null && !(domain instanceof Array)) {
			throw new Error('domain must be either instanceof Array or null');
		}
		if (domain instanceof Array) {
			if (domain.length !== this.numDimensions) {
				throw new Error('Number of elements in domain must be equal to numDimensions');
			}
			if (domain.some(interval => !(interval instanceof Array) || (interval.length !== 0 && interval.length !== 2))) {
				throw new Error('Each element in domain must be instanceof Array with length of either 0 or 2');
			}			
		}
		// use null if each element in domain is empty: [[],[],..., []]
		this.domain = (domain instanceof Array && domain.every(interval => interval.length === 0))
			? null
			: domain;
	}
}
class System {
	constructor(...entries) {
		this.numDimensions = entries[0].numDimensions;
		this.domainDefault = [...Array(this.numDimensions)].map(() => [0,10]);
		this.entries = entries.map(entry => this.set(entry));
	}
	getTransRescale(domain) {
		const transArgs = domain.map((interval, i) => {
			if (interval.length === 0) {
				return interval;
			} else {
				const entriesWithDomain = this.entries.filter(entry => entry.domain);
				const prevRange = entriesWithDomain.reduceRight((acc, entry) => {
					const range = entry.domain[i];
					return (range.length !== 0) ? range : acc;
				}, this.domainDefault[i]);
				// let prevRange = this.domainDefault[i];
				// for (let j = domainEntries.length - 1; j >= 0; j--) {
				// 	const prev = domainEntries[j].domain[i];
				// 	if (prev.length === 0) {
				// 		continue;
				// 	} else {
				// 		prevRange = prev;
				// 		break;
				// 	}
				// }
				return [prevRange[0], prevRange[1], interval[0], interval[1]];
			}
		});
		// each arg needs to be array with length of 4 [a,b,c,d] OR 0 []
		return Transformation.rescale(...transArgs);
	}
	set(entry) {
		if (!(entry instanceof SystemEntry)) {
			throw new Error('Entry must be instanceof SystemEntry');
		}
		if (entry.numDimensions !== this.numDimensions) {
			throw new Error('Each entry must have same value for numDimensions');
		}
		const inputTrans = (entry.domain) ? this.getTransRescale(entry.domain) : null;
		// this.entries.push({entry: entry, inputTrans: inputTrans});
	}
}
// console.log(new SystemEntry([Transformation.identity(3)], {domain: [[],[],[]]}).domain);

class Field {
	constructor(space, transformations = [], data = {}) {
		if (space instanceof Space) {
			this.space = space;
		} else if (space instanceof Array) {
			this.space = new Space(...space);
		} else {
			throw new Error('Field Error: first argument must be either Space or Array object');
		}
		
		this.points = [...Array(this.numPoints)].map((_,i) => new Point(
			this.space.getPosition(i),
			{'fieldStepIndexes': this.space.getCompSet(i), 'fieldIndex': i, 'field': this}
		));
		
		// this.domain = this.dimensions.map(dim => [dim.initial, dim.final]);
		this.size = this.dimensions.map(dim => dim.size);
		this.min = this.dimensions.map(dim => dim.min);
		this.max = this.dimensions.map(dim => dim.max);
		
		this.data = data;
		
		// system, process, setup
		this.system = [];
		this.inputTransMap = new Map();
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
	get numPoints() {return this.space.numPoints}
	
	transformationIdentity() {
		return Transformation.identity(this.numDimensions);
	}
	transformationCollapse(componentKeyPairs) {
		return Transformation.identity(this.numDimensions, componentKeyPairs);
	}
	transformationRescale(...domain) {
		if (domain.length !== this.numDimensions) {
			throw new Error('number of arguments must be same as this.numDimensions');
		}
		// TODO: validate domain length, either 0 or 2
		// TODO: add option for when initial and final need to exclude control points
		const transArgs = domain.map((interval, i) => {
			if (interval.length === 0) {
				return interval;
			} else {
				return [this.dimensions[i].initial, this.dimensions[i].final, interval[0], interval[1]];
			}
		});
		return Transformation.rescale(...transArgs);
	}
	
	calcInputTrans(prevDomains, newDomain) {
		// const entriesWithDomain = this.system.filter(entry => entry.domain);
		const transArgs = newDomain.map((interval, i) => {
			if (interval.length === 0) {
				return interval;
			} else {
				const prevInterval = prevDomains.reduceRight((acc, domain) => {
					return (domain[i].length !== 0) ? domain[i] : acc;
				}, [this.dimensions[i].initial, this.dimensions[i].final]);
				return [...prevInterval, ...interval];
				// const prevInterval = entriesWithDomain.reduceRight((acc, entry) => {
				// 	return (entry.domain[i].length === 0) ? acc : entry.domain[i];
				// }, [this.dimensions[i].initial, this.dimensions[i].final]);
				// return [...prevInterval, ...interval];
			}
		});
		return Transformation.rescale(...transArgs);
	}
	calcInputPosition(progress, initialPosition) {
		const lastEntryHasDomain = this.system[this.system.length - 1].domain !== null;
		return this.system
			.filter(entry => entry.domain)
			.reduce((pos, entry, i, entriesWithDomain) => {
				// use progress when last entry in system has domain AND when i corresponds to last entry in filtered system
				const transProgress = (lastEntryHasDomain && i === entriesWithDomain.length - 1) ? progress : 1;
				return entry.inputTrans.calc(pos, transProgress);
			}, initialPosition);
	}
	calcPointPosition(progress, point, inputPosition) {
		return this.system.reduceRight((position, entry, i) => {
			// use progress for last entry in system
			const transProgress = (i === this.system.length - 1) ? progress : 1;
			return entry.transformations.reduceRight((pos, trans) => {
				return trans.calc(pos, transProgress, point, this);
			}, position);
		}, inputPosition);
	}
	
	// transforms this.points and adds transformations to this.transformations array, returns this
	transform(transformations, progress = 1, domain = null) {
		if (domain) {
			// TODO: use try/except
			// this.validateDomain(domain)
			if (domain instanceof Array) {
				if (domain.length !== this.numDimensions) {
					throw new Error('domain must have length equal to this.numDimensions');
				} else {
					domain.forEach((range,i) => {
						if (range instanceof Dimension) {
							if (range.size !== this.size[i]) {
								throw new Error('each Dimension element of domain must have the same size of the corresponding element in this.size: domain[i].size === this.size[i]');
							}
						} else if (range instanceof Array) {
							if (range.length < 0 || range.length > 2) {
								throw new Error('each Array element of domain must have a length from 0 to 2');
							}
						} else {
							throw new Error('each element of domain must be either Dimension or Array object');
						}
					})
				}
			} else {
				throw new Error('domain must be an Array');
			}
		}
		
		const prevDomains = this.system.filter(entry => entry.domain).map(entry => entry.domain);
		const entry = {
			transformations: transformations,
			progress: progress,
			domain: domain,
			inputTrans: (domain) ? this.calcInputTrans(prevDomains, domain) : null
		};
		if (domain) this.inputTransMap.set(this.system.length, this.calcInputTrans(prevDomains, domain));
		this.system.push(entry);
		
		// const getPointPos = curriedCalcPointPosition(progress, this);
		// const getInputPos = curriedCalcInputPosition(progress, this.system);
		// entries with domain will also have inputTrans
		this.points.forEach((point, i) => {
			// point.position = compose(getPointPos(point), getInputPos)(this.space.getPosition(i));
			// point.position = getPointPos(point, getInputPos(this.space.getPosition(i)));
			const inputPosition = this.calcInputPosition(progress, this.space.getPosition(i));
			point.position = this.calcPointPosition(progress, point, inputPosition);
		});
		
		return this;
	}
	// calls transform method on clone of this, returns transformed clone
	transformClone(transformations, progress, domain) {
		return Field.clone(this).transform(...arguments);
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
		return this.transform(this.transformationCollapse(componentKeyPairs), progress);
	}
	collapseClone(componentKeyPairs, progress) {
		return Field.clone(this).collapse(...arguments);
	}
	// extrude() 
	
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
			this.space.getCompSet(i).forEach((dimensionIndex, j, arr) => {
			// this.space.stepIndexes[i].forEach((dimensionIndex, j, arr) => {
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
			const numFramesInFrameSet = Math.round((keyframe.percent - keyframePrev.percent) / 100 * numFrames);
			const stepInterval = 1/(numFramesInFrameSet-1);
			const framesArr = [...Array(numFramesInFrameSet)].map((_, i) => currentField.transformClone(keyframe.transformations, i*stepInterval, keyframe.domain));
			
			this.frameSet[i-1] = framesArr;
			this.frames.push(...framesArr);
			
			if (i !== this.keyframes.length - 1) {
				currentField = currentField.transform(keyframe.transformations, 1, keyframe.domain);
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
			const numFramesInFrameSet = Math.round((keyframe.percent - keyframePrev.percent) / 100 * numFrames);
			const stepInterval = 1/(numFramesInFrameSet-1);
			const framesArr = [...Array(numFramesInFrameSet)].map((_, i) => currentPoint.transformClone(keyframe.transformations, i*stepInterval));
			
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
console.log(dimTheta.rescale([50,100], .5));
// let field2D = new Field([dimR.extend(), dimTheta.extend()]);
let field2D = new Field([dimR, dimTheta]);
let field2D_mesh = Field.clone(field2D);
console.log(field2D.space);

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
		const a = field.min[0];
		// const min = field.dimensions[0].initial;
		const b = field.max[0];
		return step*((x-a)*(d-c)/(b-a)+c);
	},
	(x,y) => y
]);

// Animation
const numFrames = 400;
// TODO: update so progress gets ordered automatically 
console.time('animation2D');
let animation2D = field2D.getAnimation(numFrames, [
	{percent: 0},
	{percent: 25, transformations: [transRadial]},
	{percent: 50, transformations: [transWavy], domain: [[0,400],[0,Math.PI/2]]},
	// {percent: 70, transformations: [transScale1]},
	// {percent: 65, transformations: [collapseX]},
	// {percent: 100, transformations: [extrudeX]}
	{percent: 100, transformations: [transWavy,transWavy], domain: [[0,200],[Math.PI,-Math.PI]]}
	// {percent: 100, transformations: [field2D.transformationRescale([0,5],[-4*Math.PI,0])]}
]);
console.timeEnd('animation2D');
// console.log(animation2D.frames.slice(-1)[0].system);
let animation3D = field3D.getAnimation(numFrames, [
	{percent: 0},
	// {percent: 0, transformations: [transSpherical]},
	{percent: 20, transformations: [field3D.transformationCollapse([[1,0]])]},
	// {percent: 60, transformations: [collapseX]},
	// {percent: 100, transformations: [extrudeX]}
]);
let animation3DCollapsed = field3DCollapsed.getAnimation(numFrames, [
	{percent: 0, transformations: [transSpherical]},
	{percent: 50, transformations: [extrudeX]},
	{percent: 100, transformations: [field3DCollapsed.transformationCollapse([[1,0]])]}
]);

// Curves
let animationCurveSet2D = animation2D.frames.map(field => field.getCurveMesh({"hideOuterCurves": true}));
// let animationCurveSet3D = animation3DCollapsed.frames.map(field => field.getCurveMesh({"hideOuterCurves": true}));
let animationCurveSet3D = animation3D.frames.map(field => field.getCurveMesh({"hideOuterCurves": true}));
let mesh = field2D_mesh
	.transformClone([transRadial], 1, [[],[0,2*Math.PI]])
	// .transformClone(
	// 	[field2D.transformationRescale([],[0,2*Math.PI])],
	// 	{progress: 0}
	// )
	// {progress: 1, domain: [[],[0,2*Math.PI]]})
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
