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

class Transformation {
	constructor(
		// mapping, operator, funcList, funcArr, generator, action
		mapping,
		{progressMethod = (mapping.length > 0) ? 'custom' : 'multiplyBefore'} = {}
	) {
		// TODO: require 'custom' instead of guessing it? (stricter validation)
		// TODO: add function validation
		if (!(mapping instanceof Function) || !(mapping() instanceof Array)) {
			throw new Error('mapping must be a Function that returns an instanceof Array');
		}
		this.mapping = mapping;
		this.numDimensions = mapping().length;
		
		this.options = {
			"progressMethod": progressMethod
		};
		
		// make Transformation immutable
		Object.freeze(this);
	}
	
	// TODO: refactor everything that uses Function constructor
	// TODO: find better way to deal with higher-order function arguments
	static fromFuncArr(funcArr, options) {
		const mapping = (step, point) => funcArr;
		// return new Transformation(mapping, options);
		return new Transformation(new Function(['step', 'point'], `return [${funcArr}]`), options);
	}
	
	static argList(numDimensions) {
		return [...Array(numDimensions)].map((_, i) => `x${i}`);
	}
	
	static identityFunc(numDimensions, componentIndex) {
		// TODO: validate 0 <= dimensionIndex < numDimensions
		const argList = Transformation.argList(numDimensions);
		return new Function(argList, `return ${argList[componentIndex]}`);
	}
	static constantFunc(numDimensions, constant) {
		// TODO: validate constant instanceof Number
		return new Function(Transformation.argList(numDimensions), `return ${constant}`);
	}
	static rescaleFunc(numDimensions, componentIndex, [inputInitial, inputFinal, outputInitial, outputFinal]) {
		if (typeof outputFinal === 'undefined') {
			throw new Error('third argument must contain 4 elements: [inputInitial, inputFinal, outputInitial, outputFinal]')
		}
		if (inputInitial === inputFinal) {
			throw new Error('inputInitial and inputFinal must be different values');
		}
		const argList = Transformation.argList(numDimensions);
		// return (x-a)*(d-c)/(b-a)+c;
		return new Function(argList, `return (${argList[componentIndex]} - ${inputInitial}) * (${outputFinal - outputInitial}) / (${inputFinal - inputInitial}) + ${outputInitial}`);
	}
	static rescaleByIndexFunc(numDimensions, componentIndex, [outputInitial, outputFinal]) {
		// point.data.fieldIndex*(d-c)/(n-1)+c
		return new Function(Transformation.argList(numDimensions), `return point.data.fieldComponents[${componentIndex}]*(${outputFinal} - ${outputInitial})/(point.data.field.size[${componentIndex}] - 1) + ${outputInitial}`);
	}
	
	static rescale(inputOutputArrs) {
		// inputOutputArr ~ [inputInitial, inputFinal, outputInitial, outputFinal] || []
		// numDimensions equal to number of arguments provided
		// if inputInitial === inputFinal, then those input values will be ignored
		if (!inputOutputArrs.every(io => io instanceof Array)) {
			throw new Error(`Each argument must be an instanceof Array`);
		}
		
		const numDimensions = inputOutputArrs.length;
		const funcArr = inputOutputArrs.map((inputOutputArr, dimIndex) => {
			switch (inputOutputArr.length) {
				case 0:
					return Transformation.identityFunc(numDimensions, dimIndex);
				case 4:
					const [inputInitial, inputFinal, outputInitial, outputFinal] = inputOutputArr;
					if (inputInitial !== inputFinal) {
						return Transformation.rescaleFunc(numDimensions, dimIndex, inputOutputArr);
					} else {
						return Transformation.rescaleByIndexFunc(numDimensions, dimIndex, [outputInitial, outputFinal]);
					}
				case 2:
					throw new Error(`Each argument must have length of 0 or 4. Argument length is 2 at dimension index ${dimIndex}`);
				default:
					throw new Error('Each argument must have length of 0 or 4');
			}
		});
		return Transformation.fromFuncArr(funcArr, {progressMethod: 'multiplyAfter'});
	}
	static identity(numDimensions, ...constantKeyPairs) {
		// elementKeyPairs.length <= numDimensions with each key < numDimensions
		// if (!(elementKeyPairs instanceof Map)) elementKeyPairs = new Map(elementKeyPairs);
		const constantKeyPairsMap = new Map(constantKeyPairs);
		return Transformation.fromFuncArr([...Array(numDimensions)].map((_,i) => {
			if (constantKeyPairsMap.has(i)) {
				return Transformation.constantFunc(numDimensions, constantKeyPairsMap.get(i));
			} else {
				return Transformation.identityFunc(numDimensions, i);
			}
		}), {progressMethod: 'multiplyAfter'});
	}
	
	calcMapping(position, progress = 1, point = new Point(position)) {
		return this.mapping(progress, point).map(func => func.call(this, ...position));
	}
	calc(position, progress = 1, point = new Point(position)) {
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

class Point {
	constructor(position, data = {}) {
		// this.numDimensions = position.length;
		this.position = position;
		this.data = data;
	}
	
	// iterates components of this.position
	*[Symbol.iterator]() {
		for (let component of this.position) {
			yield component;
		}
	}
	
	clone() {
		return new Point([...this.position], Object.assign({}, this.data));
	}
	
	// TODO: should Poit use reduce or reduceRight???
	static transformPosition(position, transformations, progress, point) {
		return transformations.reduceRight((pos, trans) => {
			return trans.calc(pos, progress, point);
		}, position);
	}
	
	// updates this.position and returns this
	transform(transformations, progress) {
		this.position = Point.transformPosition(this.position, transformations, progress, this);
		// this.position = transformations.reduce((pos, trans, i) => {
		// 	return trans.calc(pos, progress, this);
		// 	// return trans.calc(acc, (i > 0) ? 1 : progress, this);
		// }, this.position);
		return this;
	}
	// transforms clone of this and returns Point clone
	transformClone(transformations, progress) {
		return this.clone().transform(...arguments);
	}
}

class Dimension {
	constructor(size, initial, final = initial) {
		if (typeof(size) !== 'number' || size !== parseInt(size) || size < 1) {
			throw new Error('Dimension Error: size must be an integer greater than or equal to 1');
		}
		if (typeof initial !== 'number') {
			throw new Error('Dimension Error: typeof initial must be number');
		}
		if (typeof final !== 'number') {
			throw new Error('Dimension Error: typeof final must be number');
		}
		if (size === 1 && final !== initial) {
			throw new Error('Dimension Error: final must equal initial when size is 1');
		}
		
		this.size = size;
		this.initial = initial;
		this.final = final;
		
		this.increment = (this.size === 1) ? 0 : (this.final - this.initial) / (this.size - 1);
		
		// properties initialized with lazy getters
		this._elements;
		this._interval;
		
		this.min = Math.min(this.initial, this.final);
		this.max = Math.max(this.initial, this.final);
	}
	
	// iterates elements of this.elements
	*[Symbol.iterator]() {
		for (const element of this.elements) {
			yield element;
		}
	}
	
	// lazy getters
	get elements() {
		return this._elements = this._elements ||
			[...Array(this.size)].map((_, i) => i*this.increment + this.initial);
	}
	get interval() {
		return this._interval = this._interval ||
			[this.initial, this.final];
	}
	
	// All extend methods return a new Dimension object
	//// extend a given number of elements before this.initial
	extendInitial(numElements = 1) {
		return new Dimension(this.size + numElements,
									this.initial - this.increment*numElements,
									this.final);
	}
	//// extend a given number of elements after this.final
	extendFinal(numElements = 1) {
		return new Dimension(this.size + numElements,
									this.initial,
									this.final + this.increment*numElements);
	}
	//// extend a given number of elements in BOTH directions
	extend(numElements = 1) {
		return this.extendInitial(numElements).extendFinal(numElements);
	}
	
	rescale([outputInitial, outputFinal], progress = 1) {
		// (x - this.initial) * (outputFinal - outputInitial) / (this.final - this.initial) + outputInitial;
		return new Dimension(this.size,
									(1-progress)*this.initial + progress*outputInitial,
									(1-progress)*this.final + progress*outputFinal);
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
				throw new Error('Space Error: each argument must be instanceof Dimension or instanceof Array');
			}
		});
		this.numDimensions = this.dimensions.length;
		this.numPoints = this.dimensions.reduce((total, dim) => total * dim.size, 1);
		
		// typed flat arrays
		this._positions = new Float32Array(this.numPoints*this.numDimensions);
		this._compSets = new Uint32Array(this.numPoints*this.numDimensions);
		const repeatArr = this.dimensions.map((_, i, arr) => {
			return arr.reduce((acc, dim, j) => acc *= (j > i) ? dim.size : 1, 1);
		});
		for (let i = 0; i < this.numPoints; i++) {
			this.dimensions.forEach((dim, j) => {
				const component = Math.floor(i / repeatArr[j]) % dim.size;
				const flatIndex = this.getFlatIndex(i,j);
				this._compSets[flatIndex] = component;
				this._positions[flatIndex] = dim.elements[component];
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
		return Array.from(this._positions.subarray(startIndex, startIndex + this.numDimensions));
	}
	getCompSet(pointIndex) {
		// subarray creates a new view on the existing buffer, as opposed to slice, which copies the selection
		const startIndex = this.getFlatIndex(pointIndex);
		return Array.from(this._compSets.subarray(startIndex, startIndex + this.numDimensions));
	}
}

class Interval {
	constructor(initial = null, final = initial) {
		this.initial = initial;
		this.final = final;
	}
	
	*[Symbol.iterator]() {
		if (this.initial === null) {
			yield null;
		} else {
			yield this.initial;
			yield this.final;
		}
	}
	
	toArray() {
		return (this.initial === null) ? [] : [...this];
	}
}
class Domain {
	constructor(...intervals) {
		if (!intervals.every(interval => interval instanceof Interval || interval instanceof Array)) {
			throw new Error('Each argument must be an instanceof Interval or an instanceof Array');
		}
		
		this.numDimensions = intervals.length;
		this.intervals = intervals.map(interval => (interval instanceof Interval) ? interval : new Interval(...interval));
	}
	
	*[Symbol.iterator]() {
		for (const interval of this.intervals) {
			yield interval.toArray();
		}
	}
	
	get(intervalIndex) {
		return this.intervals[intervalIndex];
	}
}

class FieldEntry {
	constructor(transformations, progress = 1, domains = []) {
		FieldEntry.validate(transformations, progress);
		
		this.numDimensions = transformations[0].numDimensions;
		this.transformations = transformations;
		this.progress = progress;
		
		this.domain = domains[domains.length - 1] || null;
		this.hasDomain = this.domain !== null;
		this.domainTransformation = (this.hasDomain) ? Field.rescale(...domains) : null;
		
		Object.freeze(this);
	}
	static validate(transformations, progress) {
		// transformations: REQUIRED
		if (!(transformations instanceof Array) || !transformations.every(trans => trans instanceof Transformation)) {
			throw new Error('transformations must be instanceof Array where each element is an instanceof Transformation');
		}
		const objPropsAreEqual = (propName, objArr) => objArr.reduce((bool, el, i, arr) => {
			if (i === 0) {
				return bool;
			}
			return (bool) ? arr[i-1][propName] === el[propName] : bool;
		}, true);
		if (!objPropsAreEqual('numDimensions', transformations)) {
			throw new Error('each transformation must have the same value for numDimensions');
		}
	}
}

class Field {
	constructor(space, data = {}) {
		if (space instanceof Space) {
			this.space = space;
		} else if (space instanceof Array) {
			this.space = new Space(...space);
		} else {
			throw new Error('Field Error: first argument must be instanceof Space or instanceof Array');
		}
		
		this.points = [...Array(this.numPoints)].map((_,i) => new Point(
			this.space.getPosition(i),
			{'fieldComponents': this.space.getCompSet(i), 'fieldIndex': i, 'field': this}
		));
		
		// array of integers representing numPoints for each dimension
		this.size = this.dimensions.map(dim => dim.size);
		// array of intervals (arrays with length === 2) for each dimension
		this.domain = this.dimensions.map(dim => dim.interval);
		
		this.min = this.dimensions.map(dim => dim.min);
		this.max = this.dimensions.map(dim => dim.max);
		
		this.data = data;
		
		this.entries = [];
		// if (entries.length > 0) {
		// 	entries.forEach(entry => ...);
		// }
	}
	
	static clone(self) {
		let fieldClone = Object.assign(Object.create(Object.getPrototypeOf(self)), self);
		fieldClone.points = fieldClone.points.map(point => point.clone());
		fieldClone.entries = self.entries.slice(0);
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
			this.componentCurves.reduce((total, numComponentCurves) => total + numComponentCurves, 0);
	}
	
	// Space getters
	get dimensions() {return this.space.dimensions}
	get numDimensions() {return this.space.numDimensions}
	get numPoints() {return this.space.numPoints}
	
	static rescale(...domains) {
		if (domains.some(domain => !(domain instanceof Array))) {
			throw new Error('Each domain must be an instanceof Array');
		}
		if (domains.some((domain, _, domainArr) => domain.length !== domainArr[0].length)) {
			throw new Error('Each domain must be the same length, which corresponds to numDimensions');
		}
		if (domains.some(domain => domain.some(interval => interval.length !== 0 && interval.length !== 2))) {
			throw new Error('Each domain interval must have length of either 0 or 2');
		}
		
		// domains: Array of at least 2 domains that have non-empty interval(s)
		// [domainStart, ..., domainStop]
		//// domain: Array of intervals
		//// note: any domain where all intervals have length of 0 will be omitted
		//// [interval_1, interval_2, ..., interval_numDimensions]
		////// interval: Array of numbers with length of 0 or 2
		////// [] || [initial, final]
		
		// [[x0, y0, ..., z0], [x1, y1, ..., z1], ..., [x_n-1, y_n-1, ..., z_n-1]]
		// EXAMPLE //
		// domains: [[x0, _, _], [x1, _, z1], [x2, _, _], [x3, y3, _], [_, _, _]]	<<< domains
		//// filter empty domains:
		//// [[x0, _, _], [x1, _, z1], [x2, _, _], [x3, y3, _]]		<<< domains
		//// separate last domain (whose intervals will be used as output) from all previous domains:
		//// [x3, y3, _]											<<< outputIntervals
		//// [[x0, _, _], [x1, _, z1], [x2, _, _]]		<<< domainsInput
		//// get input interval for each dimension (last non-empty interval for each dimension, if provided)
		//// [x2, _, z1]											<<< inputIntervals
		//// combine input and output intervals for each dimension
		//// [[x2, x3], [_, y3], [z1, _]]
		//// for each dimension: if neither interval is empty, return combined input and output; else return empty array:
		//// [[x2_i, x2_f, x3_i, x3_f], [], []]			<<< inputOutputLists
		//// throw error if every dimension results in an empty array
		
		// remove empty domains (any domain where all intervals have length of 0)
		const domainsFiltered = domains.filter(domain => domain.some(interval => interval !== 0));
		
		const outputIntervals = domainsFiltered[domainsFiltered.length - 1];
		const inputIntervals = domainsFiltered.slice(0,-1)
			.reduceRight((intervals, domain) => {
				return intervals.map((interval, dimIndex) => {
					return (interval.length === 0) ? domain[dimIndex] : interval;
				});
			}, outputIntervals.map(() => []));
		
		const inputOutputLists = outputIntervals.map((output, dimIndex) => {
			const input = inputIntervals[dimIndex];
			return (input.length !== 0 && output.length !== 0) ? [...input, ...output] : [];
		});
		
		if (inputOutputLists.every(ioList => ioList.length === 0)) {
			throw new Error('Must provide both an input and output interval for at least one dimension of domains');
		}
		
		return Transformation.rescale(inputOutputLists);
	}
	
	transformationIdentity() {
		return Transformation.identity(this.numDimensions);
	}
	transformationCollapse(componentKeyPairs) {
		return Transformation.identity(this.numDimensions, componentKeyPairs);
	}
	transformationRescale(...domainsStop) {
		return Field.rescale(this.domain, ...domainsStop);
	}
	
	calcDomainPosition(point, entries, initialPosition = this.space.getPosition(point.data.fieldIndex)) {
		return this.entries
			.filter(entry => entry.hasDomain)
			.reduce((position, entry) => {
				return entry.domainTransformation.calc(position, entry.progress, point);
			}, initialPosition);
	}
	transformPoint(point, entries, domainPosition = this.calcDomainPosition(point, entries)) {
		point.position = entries.reduceRight((position, entry) => {
			return Point.transformPosition(position, entry.transformations, entry.progress, point)
		}, domainPosition);
		return point;
	}
	
	getExtendedDomain(domain) {
		return domain.map((interval, i) => {
			return (interval.length !== 0)
				? new Dimension(this.size[i], ...interval).extend().interval
				: interval;
		});
	}
	
	transform(transformations, progress, domain, percent = 100) {
		// transformations
		if (!(transformations instanceof Array)) {
			throw new Error('transformations must be instanceof Array');
		}
		if (transformations.some(trans => !(trans instanceof Transformation) || trans.numDimensions !== this.numDimensions)) {
			throw new Error('each element in transformations must be an instanceof Transformation with numDimensions equal to field numDimensions');
		}
		
		const domains = (domain && domain.some(interval => interval.length !== 0))
			? [this.domain, ...this.entries.filter(entry => entry.hasDomain).map(entry => entry.domain), domain]
			: [];
		
		this.entries.push(new FieldEntry(transformations, progress, domains));
		
		this.points.map(point => this.transformPoint(point, this.entries));
		
		return this;
	}
	// calls transform method on clone of this, returns transformed clone
	transformClone(transformations, progress, domain, percent) {
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
// TODO: address issue for when intervalInitial === intervalFinal (add option for how to handle), or separate Transformation method (rescaleFieldIndex)
console.log(Field.rescale([[0,20],[2,3]], [[],[]], [[],[3,4]]).calc([12,34]));

class FieldKeyframe {
	// [%, FieldEntry]
	constructor({percent, transformations, progress = 1, domain = [...Array(transformations[0].numDimensions)].map(() => [])} = {}) {
		if (typeof percent !== 'number' || percent < 0 || percent > 100) {
			throw new Error('percent must be a number between 0 and 100 (inclusive)');
		}
		
		this.percent = percent;
		this.transformations = transformations;
		this.progress = progress;
		this.domain = domain;
	}
	
	get transformParams() {
		return [this.transformations, this.progress, this.domain];
	}
}

// percent, transformation, domain
class Animation {
	constructor(field, keyframes, numFrames) {
		if (!(field instanceof Field)) {
			throw new Error('field must be an instanceof Field');
		}
		this.field = field;
		
		if (!(keyframes instanceof Array) && !(keyframes instanceof Function)) {
			throw new Error('keyframes must be instanceof Array or instanceof Function')
		}
		if (keyframes instanceof Function) {
			keyframes = keyframes.call(this, this.field);
			if (!(keyframes instanceof Array)) {
				throw new Error('keyframes formatted as an instanceof Function must return an instanceof Array');
			}
		}
		
		// returns array of FieldKeyframe objects sorted by percent
		// if duplicate percent values exist, only the last object with that percentage will be used
		this.keyframes = keyframes
			.map(keyframe => (keyframe instanceof FieldKeyframe) ? keyframe: new FieldKeyframe(keyframe))
			.sort((keyframeA, keyframeB) => keyframeA.percent - keyframeB.percent)
			.filter((keyframe, i, keyframes) => (i === keyframes.length - 1) ? true : keyframe.percent !== keyframes[i+1].percent);
		
		this.fieldFinal = this.keyframes.reduce((fieldAcc, keyframe) => {
				return fieldAcc.transform(...keyframe.transformParams);
			}, Field.clone(field));
		
		if (typeof(numFrames) !== 'number' || numFrames !== parseInt(numFrames) || numFrames < this.keyframes.length) {
			throw new Error('numFrames must be an integer greater than or equal to keyframes.length');
		}
		this.numFrames = numFrames;
		
		this.keyframeFields = this.keyframes.reduce((fields, keyframe, i, keyframes) => {
			const keyframeField = (i === 0)
				? Field.clone(this.field)
				: fields[i-1].transformClone(...keyframes[i-1].transformParams);
			return [...fields, keyframeField];
		}, []);
		
		this.frames = this.keyframes.reduce((map, keyframe, i, keyframes) => {
			const percentPrev = (i === 0) ? 0 : keyframes[i-1].percent;
			const numFramesInFrameSet = Math.round((keyframe.percent - percentPrev) / 100 * numFrames);
			const stepInterval = 1/(numFramesInFrameSet-1);

			for (let j = 0; j < numFramesInFrameSet; j++) {
				map.set(map.size, this.keyframeFields[i].transformClone(keyframe.transformations, j*stepInterval*keyframe.progress, keyframe.domain));
			}
			
			return map;
		}, new Map());
		console.log(this.frames);
		// new Map([[frameNumber, field]])
	}
}

// TODO: REFACTOR
class FieldAnimation {
	constructor(field, numFrames, keyframes) {
		this.field = Field.clone(field);
		this.numFrames = numFrames;
		// TODO: keyframes validation, possibly separate object
		this.keyframes = keyframes;
		// TODO: combine frameSet and frames, using frame MAP object with 'keyframe' property
		// this.frameSet = [...Array(keyframes.length-1)];
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
			const framesArr = [...Array(numFramesInFrameSet)].map((_, j) => currentField.transformClone(keyframe.transformations, j*stepInterval, keyframe.domain));
			
			// this.frameSet[i-1] = framesArr;
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

// console.log(new FieldEntry([transRadial], 1, [[],[0,10]], [[],[0,100]]).domainTransformation.mapping);

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

let field2D = new Field([dimR.extend(), dimTheta.extend()]);
let field2D_mesh = Field.clone(field2D);

const c = 49;
const d = 51;
let isEdgePoint = (p) => p.data.fieldComponents.some((el,i) => el === 0 || el === (p.data.field.size[i] - 1));
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
const numFrames = 300;
// TODO: update so percent gets ordered automatically
console.time('animation2D');

let animation = new Animation(
	field2D,
	(target) => [
		{percent: 0, transformations: [target.transformationIdentity()]},
		// {percent: 50, transformations: [transWavy], domain: target.getExtendedDomain([[200,200],[0,Math.PI/2]])},
		{percent: 25, transformations: [transRadial]},
		{percent: 50, transformations: [target.transformationIdentity()], domain: target.getExtendedDomain([[200,200],[0,Math.PI]])},
		{percent: 75, transformations: [target.transformationIdentity()], domain: target.getExtendedDomain([[-150,-50],[0,2*Math.PI]])},
		// {percent: 100, transformations: [target.transformationIdentity()], domain: target.getExtendedDomain([[0,200],[]])}
		{percent: 100, transformations: [transWavy], domain: target.getExtendedDomain([[50,200],[]])}
	],
	numFrames
);
let animation2D = field2D.getAnimation(numFrames, [
		{percent: 0},
		{percent: 25, transformations: [transRadial, transWavy]},
		{percent: 50, transformations: [field2D.transformationIdentity()], domain: field2D.getExtendedDomain([[200,200],[0,Math.PI/2]])},
		{percent: 75, progress: .5, transformations: [field2D.transformationIdentity()], domain: field2D.getExtendedDomain([[-300,300],[]])},
		{percent: 100, transformations: [transWavy, transWavy], domain: field2D.getExtendedDomain([[],[0,Math.PI]])},
	]);
console.timeEnd('animation2D');
let animation3D = field3D.getAnimation(numFrames, [
	{percent: 0},
	// {percent: 0, transformations: [transSpherical]},
	{percent: 20, transformations: [field3D.transformationCollapse([[1,0]])]},
	// {percent: 60, transformations: [collapseX]},
]);
let animation3DCollapsed = field3DCollapsed.getAnimation(numFrames, [
	{percent: 0, transformations: [transSpherical]},
	{percent: 100, transformations: [field3DCollapsed.transformationCollapse([[1,0]])]}
]);

// Curves
let animationCurveSet = Array.from(animation.frames.values()).map(field => field.getCurveMesh({"hideOuterCurves": true}));
let animationCurveSet2D = animation2D.frames.map(field => field.getCurveMesh({"hideOuterCurves": true}));
// let animationCurveSet3D = animation3DCollapsed.frames.map(field => field.getCurveMesh({"hideOuterCurves": true}));
let animationCurveSet3D = animation3D.frames.map(field => field.getCurveMesh({"hideOuterCurves": true}));

let mesh = field2D_mesh
	.transform([transRadial, transWavy], .5)
	.transform([field2D.transformationIdentity()], .5, [[200,200],[]])
	// .transform([transWavy], 1 ,[[],[0,2*Math.PI]])
	// .transform([field2D.transformationIdentity()], .5 ,[[0,100],[]])
	.getCurveMesh({"hideOuterCurves": true});
console.log(field2D_mesh);

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
	
	let currentCurveSet = animationCurveSet[animationIndex];
	let currentCurveSet2D = animationCurveSet2D[animationIndex];
	let currentCurveSet3D = animationCurveSet3D[animationIndex];
	
	// // x-curves
	stroke('orange');
	// mesh[0].forEach(curve => drawCurve(curve));
	currentCurveSet[0].forEach(curve => drawCurve(curve));
	// currentCurveSet2D[0].forEach(curve => drawCurve(curve));
	// currentCurveSet3D[0].forEach(curve => drawCurve(curve));
	// // y-curves
	stroke('green');
	// mesh[1].forEach(curve => drawCurve(curve));
	currentCurveSet[1].forEach(curve => drawCurve(curve));
	// currentCurveSet2D[1].forEach(curve => drawCurve(curve));
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
