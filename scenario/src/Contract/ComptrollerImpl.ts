import { Contract } from '../Contract';
import { Sendable } from '../Invokation';
import { encodedNumber } from '../Encoding';

interface ComptrollerImplMethods {
  _become(
    comptroller: string,
  ): Sendable<string>;
}

export interface ComptrollerImpl extends Contract {
  methods: ComptrollerImplMethods;
}
