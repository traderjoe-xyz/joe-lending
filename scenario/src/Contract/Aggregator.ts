import {Contract} from '../Contract';
import {Sendable} from '../Invokation';
import {encodedNumber} from '../Encoding';

interface MockAggregatorMethods {
  setAnswer(answer: encodedNumber): Sendable<void>
}

export interface MockAggregator extends Contract {
  methods: MockAggregatorMethods
}
